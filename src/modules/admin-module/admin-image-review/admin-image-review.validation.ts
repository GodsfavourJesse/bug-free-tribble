import { z } from "zod";

export const adminImageReviewListQuerySchema =
    z.object({
        status: z
            .enum([
                "ALL",
                "PENDING",
                "REVIEW",
                "FAILED",
                "PASSED",
            ])
            .default("REVIEW"),

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
                "oldest",
                "newest",
            ])
            .default("oldest"),
    });

export const adminImageReviewParamsSchema =
    z.object({
        imageId: z.string().uuid(),
    });

export const adminImageReviewDecisionSchema =
    z
        .object({
            decision: z.enum([
                "APPROVED",
                "REJECTED",
                "NEEDS_REVIEW",
            ]),

            reason: z
                .string()
                .trim()
                .max(2000)
                .optional(),

            notes: z
                .string()
                .trim()
                .max(5000)
                .optional(),
        })
        .superRefine(
            (value, context) => {
                if (
                    value.decision ===
                        "REJECTED" &&
                    !value.reason
                ) {
                    context.addIssue({
                        code: "custom",
                        path: ["reason"],
                        message:
                            "A reason is required when rejecting an image.",
                    });
                }
            },
        );

export type AdminImageReviewListQuery =
    z.infer<
        typeof adminImageReviewListQuerySchema
    >;

export type AdminImageReviewDecisionInput =
    z.infer<
        typeof adminImageReviewDecisionSchema
    >;