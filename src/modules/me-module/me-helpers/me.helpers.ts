import {
    users,
} from "../../../database/schema/index.ts";

export function sanitizeUser(
    user: typeof users.$inferSelect,
) {
    return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        profileMetadata: user.profileMetadata,
        accountType: user.accountType,
        status: user.status,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}