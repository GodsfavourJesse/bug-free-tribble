import { z } from "zod";

export const rejectListingSchema =
    z.object({
        reason: z
            .string()
            .trim()
            .min(
                5,
                "A rejection reason is required.",
            )
            .max(2000),
    });