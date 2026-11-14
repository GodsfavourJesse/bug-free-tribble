import { and, eq } from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    conversations,
    conversationParticipants,
    listings,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../../database/schema/index.ts";

import {
    sendMessage,
} from "../../messaging-module/messaging.service.ts";

export interface ContactSellerInput {
    listingId: string;
    buyerId: string;
    message?: string;
}

async function findExistingConversation(
    buyerId: string,
    sellerId: string,
    listingId: string,
): Promise<string | null> {
    const buyerConversations = await db
        .select({
            conversationId:
                conversationParticipants.conversationId,
        })
        .from(conversationParticipants)
        .innerJoin(
            conversations,
            eq(
                conversationParticipants.conversationId,
                conversations.id,
            ),
        )
        .where(
            and(
                eq(
                    conversationParticipants.userId,
                    buyerId,
                ),
                eq(
                    conversations.type,
                    "BUYER_SELLER",
                ),
                eq(conversations.listingId, listingId),
            ),
        );

    for (const conversation of buyerConversations) {
        const sellerParticipant = await db
            .select({
                userId:
                    conversationParticipants.userId,
            })
            .from(conversationParticipants)
            .where(
                and(
                    eq(
                        conversationParticipants.conversationId,
                        conversation.conversationId,
                    ),
                    eq(
                        conversationParticipants.userId,
                        sellerId,
                    ),
                ),
            )
            .limit(1);

        if (sellerParticipant[0]) {
            return conversation.conversationId;
        }
    }

    return null;
}

async function createDirectConversation(
    buyerId: string,
    sellerId: string,
    listingId: string,
): Promise<string> {
    return db.transaction(async (tx) => {
        const conversationResult = await tx
            .insert(conversations)
            .values({
                type: "BUYER_SELLER",
                listingId,
            })
            .returning({
                id: conversations.id,
            });

        const conversation =
            conversationResult[0];

        if (!conversation) {
            throw new Error(
                "Unable to create conversation.",
            );
        }

        await tx
            .insert(conversationParticipants)
            .values([
                {
                    conversationId:
                        conversation.id,
                    userId: buyerId,
                },
                {
                    conversationId:
                        conversation.id,
                    userId: sellerId,
                },
            ]);

        return conversation.id;
    });
}

export async function contactListingSeller(
    input: ContactSellerInput,
) {
    const result = await db
        .select({
            listing: listings,
            variant: vehicleVariants,
            generation: vehicleGenerations,
            model: vehicleModels,
            make: vehicleMakes,
        })
        .from(listings)
        .leftJoin(
            vehicleVariants,
            eq(
                listings.vehicleVariantId,
                vehicleVariants.id,
            ),
        )
        .leftJoin(
            vehicleGenerations,
            eq(
                vehicleVariants.generationId,
                vehicleGenerations.id,
            ),
        )
        .leftJoin(
            vehicleModels,
            eq(
                vehicleGenerations.modelId,
                vehicleModels.id,
            ),
        )
        .leftJoin(
            vehicleMakes,
            eq(
                vehicleModels.makeId,
                vehicleMakes.id,
            ),
        )
        .where(
            eq(
                listings.id,
                input.listingId,
            ),
        )
        .limit(1);

    const record = result[0];

    if (!record) {
        throw new Error(
            "Listing not found.",
        );
    }

    if (
        record.listing.status !==
        "APPROVED"
    ) {
        throw new Error(
            "This listing is not currently available.",
        );
    }

    if (
        record.listing.expiresAt !== null &&
        record.listing.expiresAt <= new Date()
    ) {
        throw new Error(
            "This listing has expired.",
        );
    }

    if (
        record.listing.sellerId ===
        input.buyerId
    ) {
        throw new Error(
            "You cannot contact yourself about your own listing.",
        );
    }

    let conversationId =
        await findExistingConversation(
            input.buyerId,
            record.listing.sellerId,
            input.listingId,
        );

    if (!conversationId) {
        conversationId =
            await createDirectConversation(
                input.buyerId,
                record.listing.sellerId,
                input.listingId,
            );
    }

    const message =
        input.message?.trim();

    if (message) {
        await sendMessage(
            conversationId,
            input.buyerId,
            message,
        );
    }

    return {
        conversationId,
        listingId: input.listingId,
        sellerId: record.listing.sellerId,
        vehicle: {
            make: {
                id: record.make?.id ?? null,
                name: record.make?.name ?? record.listing.makeName,
            },
            model: {
                id: record.model?.id ?? null,
                name: record.model?.name ?? record.listing.modelName,
            },
            generation: {
                id: record.generation?.id ?? null,
                name: record.generation?.name ?? record.listing.generationName,
            },
            variant: {
                id: record.variant?.id ?? null,
                name: record.variant?.name ?? record.listing.variantName,
            },
            year: record.listing.year,
            bodyStyle: record.listing.bodyStyle,
            fuelType: record.listing.fuelType,
            transmission: record.listing.transmission,
            driveType: record.listing.driveType,
            engineCapacity: record.listing.engineCapacity,
        },
        messageSent: Boolean(message),
    };
}
