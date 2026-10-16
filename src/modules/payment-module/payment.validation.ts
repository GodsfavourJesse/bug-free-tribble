import { z } from "zod";

export const initializeSubscriptionPaymentSchema =
    z.object({
        planId:
            z.string().uuid(),
    });

export const initializeBoostPaymentSchema =
    z.object({
        boostId:
            z.string().uuid(),
    });

export const verifyPaymentSchema =
    z.object({
        reference:
            z.string()
                .min(8)
                .max(100),
    });