import { z } from "zod";

// Keep pagination and preference validation at the HTTP boundary.
export const notificationListSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).default(0),
});

export const notificationPreferencesSchema = z.object({
    inAppEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
}).refine(
    (value) =>
        value.inAppEnabled !== undefined ||
        value.emailEnabled !== undefined,
    {
        message: "At least one preference must be provided.",
    },
);
