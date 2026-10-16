import {
    z,
} from "zod";

const phoneSchema = z
    .string()
    .trim()
    .min(7)
    .max(30)
    .regex(
        /^[+0-9()\-.\s]+$/,
        "Invalid phone number format.",
    );

const profileMetadataSchema = z.record(
    z.string(),
    z.unknown(),
);

export const updateMeSchema = z
    .object({
        firstName: z
            .string()
            .trim()
            .min(2)
            .max(100)
            .optional(),

        lastName: z
            .string()
            .trim()
            .min(2)
            .max(100)
            .optional(),

        phone: phoneSchema
            .nullable()
            .optional(),

        avatarUrl: z
            .string()
            .trim()
            .url()
            .max(500)
            .nullable()
            .optional(),

        profileMetadata:
            profileMetadataSchema.optional(),
    })
    .strict();

export const updatePrivacySchema = z
    .object({
        showPhone: z.boolean().optional(),
        showEmail: z.boolean().optional(),
        allowDirectMessages: z.boolean().optional(),
        showOnlineStatus: z.boolean().optional(),
        allowMarketingEmails: z.boolean().optional(),
        allowMarketingSms: z.boolean().optional(),
    })
    .strict();

export const sessionIdSchema = z.object({
    sessionId: z.string().uuid(),
});

export type UpdateMeInput = z.infer<
    typeof updateMeSchema
>;

export type UpdatePrivacyInput = z.infer<
    typeof updatePrivacySchema
>;