import {
    and,
    asc,
    count,
    eq,
    ne,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    conversationParticipants,
    conversations,
    messages,
} from "../../../database/schema/index.ts";

import { getSocketIO } from "../../../realtime/socket.ts";

import {
    createNotification,
} from "../../notification-module/notification.service.ts";

import {
    isParticipant,
} from "./conversation.helper.ts";

export interface MessagePaginationOptions {
    page: number;
    limit: number;
}

const MAX_MESSAGE_LENGTH = 5000;
const MAX_MESSAGE_PAGE_SIZE = 100;

/**
 * Sends a message after checking the sender's actual
 * messaging authorization.
 *
 * BUYER_SELLER:
 *   The sender must be a recorded conversation participant.
 *
 * SUPPORT:
 *   The sender must be the requester or currently assigned agent.
 *
 * Administrators with support:ticket:view_all may read all
 * support tickets, but that permission alone does not authorize
 * them to send messages.
 *
 * Resolved and closed support tickets are read-only.
 */
export async function sendMessage(
    conversationId: string,
    senderId: string,
    body: string,
) {
    if (
        !conversationId.trim() ||
        !senderId.trim()
    ) {
        throw new Error(
            "Conversation ID and sender ID are required.",
        );
    }

    if (
        typeof body !== "string" ||
        body.trim().length === 0
    ) {
        throw new Error(
            "Message content cannot be empty.",
        );
    }

    if (body.length > MAX_MESSAGE_LENGTH) {
        throw new Error(
            `Message content cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
        );
    }

    /*
     * Lock the conversation row while checking authorization
     * and saving the message.
     *
     * Assignment and status changes that update this same row
     * must wait until this transaction completes.
     */
    const transactionResult = await db.transaction(
        async (tx) => {
            const conversationRows = await tx
                .select({
                    id: conversations.id,
                    type: conversations.type,
                    requesterId: conversations.requesterId,
                    assignedTo: conversations.assignedTo,
                    status: conversations.status,
                })
                .from(conversations)
                .where(
                    eq(
                        conversations.id,
                        conversationId,
                    ),
                )
                .for("update")
                .limit(1);

            const conversation = conversationRows[0];

            if (!conversation) {
                throw new Error(
                    "Conversation not found.",
                );
            }

            /*
             * Closed and resolved support tickets cannot
             * receive new messages.
             */
            if (
                conversation.type === "SUPPORT" &&
                (
                    conversation.status === "CLOSED" ||
                    conversation.status === "RESOLVED"
                )
            ) {
                throw new Error(
                    "This support ticket is closed or resolved and cannot receive messages.",
                );
            }

            /*
             * Check actual messaging authorization.
             *
             * Do not use canAccessConversation() alone here:
             * support:ticket:view_all grants viewing access,
             * not automatic permission to send messages.
             */
            if (
                conversation.type === "BUYER_SELLER"
            ) {
                const participantRows = await tx
                    .select({
                        userId:
                            conversationParticipants.userId,
                    })
                    .from(conversationParticipants)
                    .where(
                        and(
                            eq(
                                conversationParticipants.conversationId,
                                conversationId,
                            ),
                            eq(
                                conversationParticipants.userId,
                                senderId,
                            ),
                        ),
                    )
                    .limit(1);

                if (!participantRows[0]) {
                    throw new Error(
                        "You are not authorized to send messages in this conversation.",
                    );
                }
            } else if (
                conversation.type === "SUPPORT"
            ) {
                const isRequester =
                    conversation.requesterId === senderId;

                const isAssignedAgent =
                    conversation.assignedTo === senderId;

                if (
                    !isRequester &&
                    !isAssignedAgent
                ) {
                    throw new Error(
                        "You must be the requester or assigned support agent to send messages in this ticket.",
                    );
                }
            } else {
                throw new Error(
                    "This conversation type does not support messaging.",
                );
            }

            /*
             * Persist the message only after authorization succeeds.
             */
            const insertedRows = await tx
                .insert(messages)
                .values({
                    conversationId,
                    senderId,
                    body,
                })
                .returning();

            const message = insertedRows[0];

            if (!message) {
                throw new Error(
                    "Unable to send message.",
                );
            }

            /*
             * Update conversation activity in the same transaction.
             */
            await tx
                .update(conversations)
                .set({
                    updatedAt: new Date(),
                })
                .where(
                    eq(
                        conversations.id,
                        conversationId,
                    ),
                );

            /*
             * Retrieve other recorded participants for
             * notification delivery.
             */
            const recipients = await tx
                .select({
                    userId:
                        conversationParticipants.userId,
                })
                .from(conversationParticipants)
                .where(
                    and(
                        eq(
                            conversationParticipants.conversationId,
                            conversationId,
                        ),
                        ne(
                            conversationParticipants.userId,
                            senderId,
                        ),
                    ),
                );

            return {
                message,
                recipients,
            };
        },
    );

    const {
        message,
        recipients,
    } = transactionResult;

    /*
     * Notifications are best-effort.
     *
     * A notification failure must not make a successfully
     * persisted message appear to have failed.
     */
    try {
        await Promise.all(
            recipients.map((recipient) =>
                createNotification({
                    userId: recipient.userId,
                    type: "MESSAGE_RECEIVED",
                    title: "New message",
                    message:
                        body.length > 120
                            ? `${body.slice(0, 117)}...`
                            : body,
                    data: {
                        conversationId,
                        messageId: message.id,
                    },
                }),
            ),
        );
    } catch (error) {
        /*
         * Log the failure without exposing message contents.
         * Durable notification retries can be added later
         * using an outbox.
         */
        console.error(
            "Message notification delivery failed.",
            error,
        );
    }

    /*
     * Realtime delivery is best-effort.
     */
    try {
        getSocketIO()
            .to(`conversation:${conversationId}`)
            .emit(
                "message:new",
                message,
            );
    } catch (error) {
        console.error(
            "Realtime message delivery failed.",
            error,
        );
    }

    return message;
}

/**
 * Retrieves a bounded page of messages for a conversation.
 *
 * Users must pass the shared conversation-access policy.
 *
 * Consequently, an administrator with support:ticket:view_all
 * may read a support conversation without being its assigned
 * agent, but that permission does not allow sending messages.
 *
 * Pages are returned in chronological order, oldest first
 * within the selected page.
 */
export async function getMessages(
    conversationId: string,
    userId: string,
    options: MessagePaginationOptions = {
        page: 1,
        limit: 50,
    },
) {
    if (
        !conversationId.trim() ||
        !userId.trim()
    ) {
        throw new Error(
            "Conversation ID and user ID are required.",
        );
    }

    /*
     * isParticipant delegates to the shared authorization policy.
     * For support conversations, that policy also allows users
     * with support:ticket:view_all to read the ticket.
     */
    const authorized = await isParticipant(
        conversationId,
        userId,
    );

    if (!authorized) {
        throw new Error(
            "You are not authorized to view this conversation.",
        );
    }

    const {
        page,
        limit,
    } = options;

    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > MAX_MESSAGE_PAGE_SIZE
    ) {
        throw new Error(
            "Invalid message pagination options.",
        );
    }

    const offset = (page - 1) * limit;

    if (!Number.isSafeInteger(offset)) {
        throw new Error(
            "Message pagination offset is too large.",
        );
    }

    const [
        messageRows,
        totalRows,
    ] = await Promise.all([
        db
            .select()
            .from(messages)
            .where(
                eq(
                    messages.conversationId,
                    conversationId,
                ),
            )
            .orderBy(
                asc(messages.createdAt),
                asc(messages.id),
            )
            .limit(limit)
            .offset(offset),

        db
            .select({
                total: count(),
            })
            .from(messages)
            .where(
                eq(
                    messages.conversationId,
                    conversationId,
                ),
            ),
    ]);

    const total = totalRows[0]?.total ?? 0;

    return {
        messages: messageRows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(
                total / limit,
            ),
        },
    };
}