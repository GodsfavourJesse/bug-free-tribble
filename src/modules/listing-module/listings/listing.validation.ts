import { z } from "zod";

export const createListingSchema =
    z.object({
        vehicleVariantId: z
            .string()
            .uuid(),

        title: z
            .string()
            .trim()
            .min(5)
            .max(200),

        description: z
            .string()
            .trim()
            .min(10)
            .max(10000),

        price: z
            .coerce
            .number()
            .positive(),

        currency: z
            .string()
            .trim()
            .min(3)
            .max(10)
            .default("NGN"),

        mileage: z
            .coerce
            .number()
            .int()
            .nonnegative()
            .optional(),

        condition: z
            .enum([
                "NEW",
                "USED",
            ])
            .default("USED"),

        country: z
            .string()
            .trim()
            .max(100)
            .default("Nigeria"),

        state: z
            .string()
            .trim()
            .max(100)
            .optional(),

        city: z
            .string()
            .trim()
            .max(100)
            .optional(),
    });

export const updateListingSchema = createListingSchema.partial();

export const listingImageSchema = z.object({
    sortOrder: z
        .coerce
        .number()
        .int()
        .nonnegative()
        .default(0),
});