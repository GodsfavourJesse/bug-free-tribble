import { z } from "zod";

export const adminUsersQuerySchema = z.object({
    type: z
        .enum([
            "ALL",
            "USER",
            "DEALER",
            "ADMIN",
        ])
        .default("ALL"),

    status: z
        .enum([
            "ALL",
            "ACTIVE",
            "SUSPENDED",
            "DELETED",
        ])
        .default("ALL"),

    search: z
        .string()
        .trim()
        .max(100)
        .optional(),

    page: z.coerce
        .number()
        .int()
        .min(1)
        .default(1),

    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20),

    sort: z
        .enum([
            "newest",
            "oldest",
        ])
        .default("newest"),
});

export const adminUserIdSchema = z.object({
    userId: z.string().uuid(),
});

export type AdminUsersQuery = z.infer<
    typeof adminUsersQuerySchema
>;