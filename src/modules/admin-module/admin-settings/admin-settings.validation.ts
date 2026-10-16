import { z } from "zod";

export const updateCommercialSettingsSchema = z
    .object({
        dealerDiscountPercent: z
            .number()
            .int()
            .min(0)
            .max(100)
            .optional(),

        freeListingCredits: z
            .number()
            .int()
            .min(0)
            .max(1000)
            .optional(),

        listingDurationDays: z
            .number()
            .int()
            .min(1)
            .max(365)
            .optional(),
    })
    .strict()
    .refine(
        (settings) =>
            Object.values(settings).some(
                (value) => value !== undefined,
            ),
        {
            message:
                "Provide at least one setting to update.",
        },
    );

export const settingsHistoryQuerySchema = z
    .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict();

export type SettingsHistoryQuery = z.infer<
    typeof settingsHistoryQuerySchema
>;

export type UpdateCommercialSettingsInput = z.infer<
    typeof updateCommercialSettingsSchema
>;

export const settingsCategorySchema = z.enum([
    "COMMERCIAL",
    "LISTINGS",
]);

export type SettingsCategory = z.infer<
    typeof settingsCategorySchema
>;