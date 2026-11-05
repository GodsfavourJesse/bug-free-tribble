import {
    and,
    eq,
    inArray,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    roles,
    userRoles,
    users,
} from "../../../database/schema/index.ts";

import {
    createNotification,
} from "../../notification-module/notification.service.ts";

import {
    sendNewUserRegistrationEmail,
} from "../../email-module/email.service.ts";

const ADMIN_ROLE_NAMES = [
    "SUPER_ADMIN",
    "ADMIN",
] as const;

interface NewRegistrationNotificationInput {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    registeredAt: Date;
}

/**
 * Notify all active administrators when a new user registers.
 *
 * Two separate delivery channels are used:
 *
 * 1. Persistent in-app notification.
 * 2. Dedicated administrative registration email.
 *
 * Email notification preferences do not suppress this
 * important administrative event.
 *
 * Failures in either delivery channel must never undo
 * a successfully completed user registration.
 */
export async function notifyAdminsOfNewRegistration(
    input: NewRegistrationNotificationInput,
): Promise<void> {
    const adminUsers = await db
        .selectDistinct({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
        })
        .from(users)
        .innerJoin(
            userRoles,
            eq(
                userRoles.userId,
                users.id,
            ),
        )
        .innerJoin(
            roles,
            eq(
                roles.id,
                userRoles.roleId,
            ),
        )
        .where(
            and(
                inArray(
                    roles.name,
                    [...ADMIN_ROLE_NAMES],
                ),
                eq(
                    users.status,
                    "ACTIVE",
                ),
            ),
        );

    const recipients = adminUsers.filter(
        (admin) =>
            admin.id !== input.userId &&
            Boolean(admin.email),
    );

    if (recipients.length === 0) {
        console.warn(
            "[REGISTRATION] No active administrator email recipients were found.",
        );

        return;
    }

    const fullName = [
        input.firstName,
        input.lastName,
    ]
        .filter(Boolean)
        .join(" ");

    await Promise.all(
        recipients.map(async (admin) => {
            const [notificationResult, emailResult] =
                await Promise.allSettled([
                    /*
                     * IN-APP NOTIFICATION
                     *
                     * We disable the generic email here because
                     * a dedicated registration email is sent below.
                     */
                    createNotification({
                        userId: admin.id,
                        type: "GENERAL",

                        title: "New user registration",

                        message:
                            `${fullName} (${input.email}) has registered on KARMASS.`,

                        data: {
                            event: "USER_REGISTERED",
                            registeredUserId: input.userId,
                            registeredUserName: fullName,
                            registeredUserEmail: input.email,
                        },

                        idempotencykey:
                            `user-registered:${input.userId}:admin:${admin.id}`,

                        sendEmail: false,
                    }),

                    /*
                     * DEDICATED ADMIN REGISTRATION EMAIL
                     */
                    sendNewUserRegistrationEmail({
                        email: admin.email,
                        firstName: admin.firstName,

                        registeredUser: {
                            id: input.userId,
                            firstName: input.firstName,
                            lastName: input.lastName,
                            email: input.email,
                            registeredAt: input.registeredAt,
                        },
                    }),
                ]);

            if (
                notificationResult.status === "rejected"
            ) {
                console.error(
                    "[REGISTRATION] Failed to create administrator in-app notification.",
                    {
                        adminId: admin.id,
                        registeredUserId: input.userId,
                        error: notificationResult.reason,
                    },
                );
            }

            if (
                emailResult.status === "rejected"
            ) {
                console.error(
                    "[REGISTRATION] Failed to send administrator registration email.",
                    {
                        adminId: admin.id,
                        adminEmail: admin.email,
                        registeredUserId: input.userId,
                        error:
                            emailResult.reason instanceof Error
                                ? emailResult.reason.message
                                : String(emailResult.reason),
                    },
                );
            } else {
                console.info(
                    "[REGISTRATION] Administrator registration email submitted successfully.",
                    {
                        adminId: admin.id,
                        adminEmail: admin.email,
                        registeredUserId: input.userId,
                    },
                );
            }
        }),
    );
}