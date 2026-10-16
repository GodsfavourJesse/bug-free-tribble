import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import {
    env,
    isEmailConfigured,
} from "../../config/env.ts";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
    const {
        EMAIL_FROM,
        SMTP_HOST,
        SMTP_USER,
        SMTP_PASSWORD,
    } = env;

    if (
        !isEmailConfigured() ||
        !EMAIL_FROM ||
        !SMTP_HOST ||
        !SMTP_USER ||
        !SMTP_PASSWORD
    ) {
        throw new Error(
            "Email service is not configured. Set EMAIL_FROM, SMTP_HOST, SMTP_USER and SMTP_PASSWORD.",
        );
    }

    if (!transporter) {
        transporter =
            nodemailer.createTransport({
                host: SMTP_HOST,
                port: env.SMTP_PORT,
                secure:
                    env.SMTP_PORT === 465,
                auth: {
                    user: SMTP_USER,
                    pass: SMTP_PASSWORD,
                },
            });
    }

    return transporter;
}

export async function sendEmailVerificationEmail(
    input: {
        email: string;
        firstName: string;
        code: string;
        token: string;
    },
): Promise<void> {
    const verificationUrl =
        `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(input.token)}`;

    await getTransporter().sendMail({
        from: env.EMAIL_FROM,
        to: input.email,
        subject:
            "Verify your KARMASS account",
        text: [
            `Hello ${input.firstName},`,
            "",
            "Welcome to KARMASS.",
            "",
            `Your verification code is: ${input.code}`,
            "",
            `You can also verify your email using this link: ${verificationUrl}`,
            "",
            `This verification request expires in ${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes.`,
            "",
            "If you did not create a KARMASS account, you can ignore this email.",
            "",
            "KARMASS",
        ].join("\n"),
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:600px;margin:0 auto">
                <h2>Verify your KARMASS account</h2>
                <p>Hello ${escapeHtml(input.firstName)},</p>
                <p>Welcome to KARMASS. Please verify your email address to activate your account.</p>
                <p style="font-size:28px;font-weight:700;letter-spacing:8px">${escapeHtml(input.code)}</p>
                <p>Or use the button below:</p>
                <p>
                    <a
                        href="${escapeHtml(verificationUrl)}"
                        style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px"
                    >
                        Verify Email
                    </a>
                </p>
                <p>This verification request expires in ${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes.</p>
                <p>If you did not create a KARMASS account, you can ignore this email.</p>
                <p>KARMASS</p>
            </div>
        `,
    });
}

export async function sendNotificationEmail(
    input: {
        email: string;
        firstName: string;
        title: string;
        message: string;
    },
): Promise<void> {
    await getTransporter().sendMail({
        from: env.EMAIL_FROM,
        to: input.email,
        subject: input.title,
        text: [
            `Hello ${input.firstName},`,
            "",
            input.message,
            "",
            "KARMASS",
        ].join("\n"),
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:600px;margin:0 auto">
                <h2>${escapeHtml(input.title)}</h2>
                <p>Hello ${escapeHtml(input.firstName)},</p>
                <p>${escapeHtml(input.message)}</p>
                <p>KARMASS</p>
            </div>
        `,
    });
}

function escapeHtml(
    value: string,
): string {
    return value
        .replaceAll(
            "&",
            "&amp;",
        )
        .replaceAll(
            "<",
            "&lt;",
        )
        .replaceAll(
            ">",
            "&gt;",
        )
        .replaceAll(
            '"',
            "&quot;",
        )
        .replaceAll(
            "'",
            "&#039;",
        );
}

export async function sendPasswordResetEmail(
    input: {
        email: string;
        firstName: string;
        token: string;
    },
): Promise<void> {
    const resetUrl =
        `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(input.token)}`;

    await getTransporter().sendMail({
        from: env.EMAIL_FROM,
        to: input.email,
        subject:
            "Reset your KARMASS password",

        text: [
            `Hello ${input.firstName},`,
            "",
            "We received a request to reset your KARMASS password.",
            "",
            `Reset your password here: ${resetUrl}`,
            "",
            `This link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes.`,
            "",
            "If you did not request a password reset, you can safely ignore this email.",
            "",
            "KARMASS",
        ].join("\n"),

        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:600px;margin:0 auto">
                <h2>Reset your KARMASS password</h2>

                <p>Hello ${escapeHtml(input.firstName)},</p>

                <p>
                    We received a request to reset your KARMASS password.
                </p>

                <p>
                    <a
                        href="${escapeHtml(resetUrl)}"
                        style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px"
                    >
                        Reset Password
                    </a>
                </p>

                <p>
                    This link expires in
                    ${env.PASSWORD_RESET_TTL_MINUTES}
                    minutes.
                </p>

                <p>
                    If you did not request a password reset,
                    you can safely ignore this email.
                </p>

                <p>KARMASS</p>
            </div>
        `,
    });
}