import { z } from "zod";

export const startAdminSecurityChallengeSchema = z.object({});

export const getAdminSecurityChallengeSchema = z.object({
    challengeToken: z
        .string()
        .min(40, "Invalid security challenge token.")
        .max(100, "Invalid security challenge token."),
});

export const submitAdminSecurityChallengeAnswerSchema =
    z.object({
        challengeToken: z
            .string()
            .min(40, "Invalid security challenge token.")
            .max(100, "Invalid security challenge token."),

        answer: z
            .string()
            .trim()
            .min(1, "Select an answer.")
            .max(100, "Answer is too long."),
    });

export type GetAdminSecurityChallengeRequest =
    z.infer<typeof getAdminSecurityChallengeSchema>;

export type SubmitAdminSecurityChallengeAnswerRequest =
    z.infer<
        typeof submitAdminSecurityChallengeAnswerSchema
    >;