import { z } from "zod";

export const suspendListingSchema =
    z.object({
        reason: z
            .string()
            .trim()
            .min(
                5,
                "A suspension reason is required.",
            )
            .max(2000),
    });