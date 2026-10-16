import { z } from "zod";

export const adminLoginSchema = z.object({
    email: z
        .string()
        .trim()
        .email("Enter a valid email address.")
        .max(255)
        .transform((value) => value.toLowerCase()),

    password: z
        .string()
        .min(1, "Password is required.")
        .max(128),

    challengeToken: z
        .string()
        .min(40, "Complete the security challenge first.")
        .max(100, "Invalid security challenge token."),
});

export type AdminLoginRequest = z.infer<
    typeof adminLoginSchema
>;