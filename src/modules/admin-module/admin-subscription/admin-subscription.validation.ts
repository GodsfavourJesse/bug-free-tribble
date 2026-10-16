import { z } from "zod";

export const createSubscriptionPlanSchema = z.object({
    name: z.string().trim().min(2).max(100),

    price: z.coerce
        .number()
        .finite()
        .nonnegative(),

    currency: z.string()
        .trim()
        .min(3)
        .max(10)
        .default("NGN"),

    durationDays: z.coerce
        .number()
        .int()
        .positive(),

    listingCredits: z.coerce
        .number()
        .int()
        .positive(),

    dealerDiscountPercent: z.coerce
        .number()
        .finite()
        .min(0)
        .max(100),

});

export const updateSubscriptionPlanSchema = z.object({
    name: z.string().trim().min(2).max(100).optional(),

    description: z.string().trim().max(5000).nullable().optional(),

    price: z.coerce
        .number()
        .finite()
        .nonnegative()
        .optional(),

    currency: z.string()
        .trim()
        .min(3)
        .max(10)
        .optional(),

    durationDays: z.coerce
        .number()
        .int()
        .positive()
        .optional(),

    listingCredits: z.coerce
        .number()
        .int()
        .positive()
        .optional(),

    dealerDiscountPercent: z.coerce
        .number()
        .finite()
        .min(0)
        .max(100)
        .optional(),

    active: z
        .union([
            z.boolean(),
            z.literal(0),
            z.literal(1),
            z.enum(["true", "false", "0", "1"]),
        ])
        .transform((value) => {
            if (typeof value === "boolean") {
                return value;
            }

            return (
                value === 1 ||
                value === "1" ||
                value === "true"
            );
        })
        .optional(),

});

export type CreateSubscriptionPlanInput = z.infer<
typeof createSubscriptionPlanSchema

> ;

export type UpdateSubscriptionPlanInput = z.infer<
typeof updateSubscriptionPlanSchema

> ;
