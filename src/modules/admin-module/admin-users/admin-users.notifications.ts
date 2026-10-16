import { eq, inArray } from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    roles,
    userRoles,
    users,
} from "../../../database/schema/index.ts";

import {
    createNotification,
} from "../../notification-module/notification.service.ts";

const ADMIN_ROLE_NAMES = [
    "SUPER_ADMIN",
    "ADMIN",
] as const;

interface NewRegistrationNotificationInput {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
}

export async function notifyAdminsOfNewRegistration(
    input: NewRegistrationNotificationInput,
): Promise<void> {
    const adminUsers = await db
        .selectDistinct({
            id: users.id,
        })
        .from(users)
        .innerJoin(
            userRoles,
            eq(userRoles.userId, users.id),
        )
        .innerJoin(
            roles,
            eq(roles.id, userRoles.roleId),
        )
        .where(
            inArray(
                roles.name,
                [...ADMIN_ROLE_NAMES],
            ),
        );

    const fullName =
        `${input.firstName} ${input.lastName}`.trim();

    await Promise.allSettled(
        adminUsers
            .filter(
                (admin) => admin.id !== input.userId,
            )
            .map((admin) =>
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
                }),
            ),
    );
}