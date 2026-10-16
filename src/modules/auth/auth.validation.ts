import { z } from "zod";

const emailSchema =
    z
        .string()
        .trim()
        .email()
        .transform(
            (value) =>
                value.toLowerCase(),
        );

const passwordSchema =
    z
        .string()
        .min(
            8,
            "Password must be at least 8 characters.",
        )
        .max(
            128,
            "Password must not exceed 128 characters.",
        );

export const registerSchema =
    z.object({
        email: emailSchema,

        password: passwordSchema,

        firstName: z
            .string()
            .trim()
            .min(2)
            .max(100),

        lastName: z
            .string()
            .trim()
            .min(2)
            .max(100),

        phone: z
            .string()
            .trim()
            .max(30)
            .optional(),
    });

export const loginSchema =
    z.object({
        email: emailSchema,

        password: z
            .string()
            .min(1)
            .max(128),
    });

export const verifyEmailCodeSchema =
    z.object({
        email: emailSchema,

        code: z
            .string()
            .trim()
            .regex(
                /^\d{6}$/,
                "Verification code must be 6 digits.",
            ),
    });

export const verifyEmailTokenSchema =
    z.object({
        token: z
            .string()
            .trim()
            .min(20)
            .max(200),
    });

export const resendVerificationSchema =
    z.object({
        email: emailSchema,
    });

export const forgotPasswordSchema =
    z.object({
        email: emailSchema,
    });

export const resetPasswordSchema =
    z.object({
        token: z
            .string()
            .trim()
            .min(20)
            .max(200),

        newPassword:
            passwordSchema,
    });

export const changePasswordSchema =
    z.object({
        currentPassword:
            z
                .string()
                .min(1)
                .max(128),

        newPassword:
            passwordSchema,
    });

export const sessionIdSchema =
    z.object({
        sessionId: z
            .string()
            .uuid(),
    });

export type RegisterInput =
    z.infer<
        typeof registerSchema
    >;

export type LoginInput =
    z.infer<typeof loginSchema>;

export type ForgotPasswordInput =
    z.infer<
        typeof forgotPasswordSchema
    >;

export type ResetPasswordInput =
    z.infer<
        typeof resetPasswordSchema
    >;

export type ChangePasswordInput =
    z.infer<
        typeof changePasswordSchema
    >;