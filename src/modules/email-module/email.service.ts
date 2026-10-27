import nodemailer from "nodemailer";

import type {
    SendMailOptions,
    Transporter,
} from "nodemailer";

import {
    env,
    isEmailConfigured,
} from "../../config/env.ts";
import { buildDealerApprovalEmail } from "./templates/dealer-approval.email.ts";
import { buildDealerRejectionEmail } from "./templates/dealer-rejection.email.ts";

let transporter: Transporter | null = null;

/**
 * Returns the configured Nodemailer transporter.
 *
 * The transporter is created lazily and reused for subsequent
 * email operations.
 */
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
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_PORT === 465,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASSWORD,
            },
        });
    }

    return transporter;
}

/**
 * Returns the configured sender.
 */
function getSender(): {
    name: string;
    address: string;
} {
    if (!env.EMAIL_FROM) {
        throw new Error(
            "Email sender is not configured. Set EMAIL_FROM.",
        );
    }

    return {
        name: env.EMAIL_FROM_NAME,
        address: env.EMAIL_FROM,
    };
}

/**
 * Escapes user-provided content before inserting it into HTML.
 */
function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/**
 * Shared email delivery function.
 *
 * Logs the result of submitting an email to the SMTP provider.
 * Throws when SMTP fails or does not accept the recipient.
 *
 * SMTP acceptance does not guarantee final inbox delivery.
 */
async function sendMailAndConfirm(
    type: string,
    recipient: string,
    options: SendMailOptions,
): Promise<void> {
    try {
        const info = await getTransporter().sendMail(
            options,
        );

        const accepted = info.accepted ?? [];
        const rejected = info.rejected ?? [];

        console.info(
            "[EMAIL] SMTP submission result",
            {
                type,
                recipient,
                messageId: info.messageId,
                accepted,
                rejected,
                response: info.response,
            },
        );

        const recipientAccepted = accepted.some(
            (address) =>
                String(address).toLowerCase() ===
                recipient.toLowerCase(),
        );

        const recipientRejected = rejected.some(
            (address) =>
                String(address).toLowerCase() ===
                recipient.toLowerCase(),
        );

        if (
            !recipientAccepted ||
            recipientRejected
        ) {
            throw new Error(
                `SMTP did not confirm acceptance of recipient ${recipient}.`,
            );
        }
    } catch (error: unknown) {
        console.error(
            "[EMAIL] Delivery submission failed",
            {
                type,
                recipient,
                error:
                    error instanceof Error
                        ? {
                              name: error.name,
                              message: error.message,
                          }
                        : String(error),
            },
        );

        throw error;
    }
}

/**
 * Verifies that Nodemailer can connect to and authenticate
 * with the configured SMTP server.
 *
 * This does not guarantee delivery to a particular inbox.
 */
export async function verifyEmailTransport(): Promise<void> {
    const mailTransporter = getTransporter();

    await mailTransporter.verify();
}

/**
 * Sends an account verification email containing a code
 * and a verification link.
 */
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

    await sendMailAndConfirm(
        "verification",
        input.email,
        {
            from: getSender(),
            to: input.email,
            subject: "Verify your KARMASS account",

            text: [
                `Hello ${input.firstName},`,
                "",
                "Welcome to KARMASS.",
                "",
                "Please verify your email address to activate your account.",
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
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:600px;margin:0 auto;padding:24px">
                    <h2 style="color:#7008E7">
                        Verify your KARMASS account
                    </h2>

                    <p>
                        Hello ${escapeHtml(input.firstName)},
                    </p>

                    <p>
                        Welcome to KARMASS. Please verify your
                        email address to activate your account.
                    </p>

                    <p>
                        Your verification code is:
                    </p>

                    <div style="padding:16px;background:#f5f3ff;border-radius:8px;text-align:center">
                        <span style="font-size:28px;font-weight:700;letter-spacing:8px;color:#7008E7">
                            ${escapeHtml(input.code)}
                        </span>
                    </div>

                    <p>
                        You can also verify your email using
                        the button below.
                    </p>

                    <p>
                        <a
                            href="${escapeHtml(verificationUrl)}"
                            style="display:inline-block;padding:12px 20px;background:#7008E7;color:#ffffff;text-decoration:none;border-radius:6px"
                        >
                            Verify Email
                        </a>
                    </p>

                    <p>
                        This verification request expires in
                        ${env.EMAIL_VERIFICATION_TTL_MINUTES}
                        minutes.
                    </p>

                    <p>
                        If you did not create a KARMASS account,
                        you can ignore this email.
                    </p>

                    <p>KARMASS</p>
                </div>
            `,
        },
    );
}

/**
 * Sends a general notification email.
 *
 * Used for application notifications and administrator-sent
 * messages to individual users.
 */
export async function sendNotificationEmail(
    input: {
        email: string;
        firstName: string;
        title: string;
        message: string;
    },
): Promise<void> {
    await sendMailAndConfirm(
        "notification",
        input.email,
        {
            from: getSender(),
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
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:600px;margin:0 auto;padding:24px">
                    <h2 style="color:#7008E7">
                        ${escapeHtml(input.title)}
                    </h2>

                    <p>
                        Hello ${escapeHtml(input.firstName)},
                    </p>

                    <p style="white-space:pre-wrap">
                        ${escapeHtml(input.message)}
                    </p>

                    <p>KARMASS</p>
                </div>
            `,
        },
    );
}

/**
 * Sends a password-reset email.
 */
export async function sendPasswordResetEmail(
    input: {
        email: string;
        firstName: string;
        token: string;
    },
): Promise<void> {
    const resetUrl =
        `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(input.token)}`;

    await sendMailAndConfirm(
        "password-reset",
        input.email,
        {
            from: getSender(),
            to: input.email,
            subject: "Reset your KARMASS password",

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
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:600px;margin:0 auto;padding:24px">
                    <h2 style="color:#7008E7">
                        Reset your KARMASS password
                    </h2>

                    <p>
                        Hello ${escapeHtml(input.firstName)},
                    </p>

                    <p>
                        We received a request to reset your
                        KARMASS password.
                    </p>

                    <p>
                        <a
                            href="${escapeHtml(resetUrl)}"
                            style="display:inline-block;padding:12px 20px;background:#7008E7;color:#ffffff;text-decoration:none;border-radius:6px"
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
        },
    );
}


/**
 * Sends a professionally branded dealer application decision email.
 *
 * Uses dedicated HTML templates for approval and rejection.
 * Sends both HTML and plain-text versions for email compatibility.
 */
export async function sendDealerDecisionEmail(
    input:
        | {
              decision: "APPROVED";
              email: string;
              firstName: string;
              companyName: string;
              reviewDate: string;
          }
        | {
              decision: "REJECTED";
              email: string;
              firstName: string;
              companyName: string;
              rejectionReason: string;
              reviewDate: string;
          },
): Promise<void> {
    const dashboardUrl =
        `${env.CLIENT_URL}/dashboard/dealer`;

    const applicationUrl =
        `${env.CLIENT_URL}/dashboard/dealer/applications`;

    const isApproved = input.decision === "APPROVED";

    const subject = isApproved
        ? "Congratulations! Your KARMASS Dealer Application Has Been Approved"
        : "An Update on Your KARMASS Dealer Application";

    const html = isApproved
        ? buildDealerApprovalEmail({
              firstName: input.firstName,
              companyName: input.companyName,
              dashboardUrl,
              reviewDate: input.reviewDate,
          })
        : buildDealerRejectionEmail({
              firstName: input.firstName,
              companyName: input.companyName,
              rejectionReason: input.rejectionReason,
              applicationUrl,
              reviewDate: input.reviewDate,
          });

    const text = isApproved
        ? [
              `Hello ${input.firstName},`,
              "",
              "Congratulations! Your application to become a verified dealer on KARMASS has been approved.",
              "",
              `Business name: ${input.companyName}`,
              `Approval date: ${input.reviewDate}`,
              "",
              "Your verified dealer profile has been created.",
              "",
              "You can access your dealer dashboard here:",
              dashboardUrl,
              "",
              "Thank you for choosing KARMASS.",
              "",
              "KARMASS Team",
          ].join("\n")
        : [
              `Hello ${input.firstName},`,
              "",
              "Thank you for your interest in becoming a verified dealer on KARMASS.",
              "",
              "Following our review, we are unable to approve your application at this time.",
              "",
              `Business name: ${input.companyName}`,
              `Review date: ${input.reviewDate}`,
              "",
              "Reason for non-approval:",
              input.rejectionReason,
              "",
              "Please review the issue identified and access your application details here:",
              applicationUrl,
              "",
              "If you require clarification, please contact KARMASS support.",
              "",
              "Thank you for your understanding.",
              "",
              "KARMASS Team",
          ].join("\n");

    await sendMailAndConfirm(
        isApproved
            ? "dealer-application-approved"
            : "dealer-application-rejected",
        input.email,
        {
            from: getSender(),
            to: input.email,
            subject,
            text,
            html,
        },
    );
}