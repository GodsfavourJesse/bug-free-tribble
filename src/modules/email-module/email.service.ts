import {
    env,
    isEmailConfigured,
} from "../../config/env.ts";

import { buildDealerApprovalEmail } from "./templates/dealer-approval.email.ts";
import { buildDealerRejectionEmail } from "./templates/dealer-rejection.email.ts";

const BRAND_COLOR = "#1491FF";
const BRAND_DARK = "#0877D9";
const BRAND_LIGHT = "#EAF5FF";
const BRAND_SOFT = "#F4F9FF";

const CLIENT_URL = env.CLIENT_URL.replace(/\/+$/, "");

const BREVO_API_URL = "https://api.brevo.com/v3";

const EMAIL_REQUEST_TIMEOUT_MS = 15_000;

type EmailMessageOptions = {
    from: {
        name: string;
        address: string;
    };
    to: string;
    subject: string;
    text?: string;
    html?: string;
};

/**
 * Returns the configured Brevo API key.
 */
function getBrevoApiKey(): string {
    if (
        !isEmailConfigured() ||
        !env.EMAIL_FROM ||
        !env.BREVO_API_KEY
    ) {
        throw new Error(
            "Email service is not configured. Set EMAIL_FROM and BREVO_API_KEY.",
        );
    }

    return env.BREVO_API_KEY;
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
 * Formats dates using Nigerian local time.
 */
function formatEmailDate(
    value: Date | string,
): string {
    const date = value instanceof Date
        ? value
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Not available";
    }

    return new Intl.DateTimeFormat("en-NG", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Africa/Lagos",
    }).format(date);
}

/**
 * Formats monetary values safely.
 */
function formatEmailMoney(
    amount: string | number,
    currency: string,
): string {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount)) {
        return `${currency} ${String(amount)}`;
    }

    try {
        return new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: currency.toUpperCase(),
        }).format(numericAmount);
    } catch {
        return `${currency.toUpperCase()} ${numericAmount.toLocaleString("en-NG")}`;
    }
}

/**
 * Shared branded email layout.
 */
function buildEmailLayout(input: {
    title: string;
    preheader: string;
    content: string;
    footer?: string;
}): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta
                name="viewport"
                content="width=device-width, initial-scale=1.0"
            />
            <meta
                name="color-scheme"
                content="light"
            />
            <title>${escapeHtml(input.title)}</title>
        </head>

        <body style="
            margin:0;
            padding:0;
            background:#F3F6FA;
            font-family:Arial,Helvetica,sans-serif;
            color:#172033;
        ">
            <div style="
                display:none;
                max-height:0;
                overflow:hidden;
                opacity:0;
                color:transparent;
            ">
                ${escapeHtml(input.preheader)}
            </div>

            <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="background:#F3F6FA;padding:32px 12px;"
            >
                <tr>
                    <td align="center">

                        <table
                            role="presentation"
                            width="600"
                            cellspacing="0"
                            cellpadding="0"
                            border="0"
                            style="
                                width:100%;
                                max-width:600px;
                                background:#ffffff;
                                border-radius:16px;
                                overflow:hidden;
                                border:1px solid #E5EAF1;
                            "
                        >

                            <tr>
                                <td style="
                                    background:${BRAND_COLOR};
                                    padding:30px 32px;
                                    text-align:center;
                                ">
                                    <div style="
                                        font-size:29px;
                                        line-height:1.2;
                                        font-weight:800;
                                        letter-spacing:1px;
                                        color:#ffffff;
                                    ">
                                        KARMASS
                                    </div>

                                    <div style="
                                        margin-top:7px;
                                        font-size:12px;
                                        color:#EAF5FF;
                                        letter-spacing:1.5px;
                                    ">
                                        YOUR CAR MARKETPLACE
                                    </div>
                                </td>
                            </tr>

                            <tr>
                                <td style="
                                    padding:36px 32px;
                                ">
                                    <h1 style="
                                        margin:0 0 20px;
                                        font-size:25px;
                                        line-height:1.35;
                                        color:#172033;
                                    ">
                                        ${escapeHtml(input.title)}
                                    </h1>

                                    ${input.content}
                                </td>
                            </tr>

                            <tr>
                                <td style="
                                    padding:24px 32px;
                                    background:${BRAND_SOFT};
                                    border-top:1px solid #E5EAF1;
                                    text-align:center;
                                ">
                                    <p style="
                                        margin:0 0 8px;
                                        font-size:13px;
                                        color:#64748B;
                                    ">
                                        ${escapeHtml(
                                            input.footer ??
                                            "Thank you for choosing KARMASS."
                                        )}
                                    </p>

                                    <p style="
                                        margin:0;
                                        font-size:12px;
                                        color:#94A3B8;
                                    ">
                                        &copy; ${new Date().getFullYear()} KARMASS.
                                        All rights reserved.
                                    </p>
                                </td>
                            </tr>

                        </table>

                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;
}

/**
 * Reusable information row for subscription emails.
 */
function buildEmailDetailRow(
    label: string,
    value: string,
): string {
    return `
        <tr>
            <td style="
                padding:13px 14px;
                border-bottom:1px solid #E8EDF4;
                font-size:13px;
                color:#64748B;
                width:42%;
            ">
                ${escapeHtml(label)}
            </td>

            <td style="
                padding:13px 14px;
                border-bottom:1px solid #E8EDF4;
                font-size:14px;
                font-weight:600;
                color:#172033;
                text-align:right;
            ">
                ${escapeHtml(value)}
            </td>
        </tr>
    `;
}

/**
 * Reusable CTA button.
 */
function buildEmailButton(
    url: string,
    label: string,
): string {
    return `
        <table
            role="presentation"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="margin:26px 0 12px;"
        >
            <tr>
                <td
                    align="center"
                    bgcolor="${BRAND_COLOR}"
                    style="border-radius:8px;"
                >
                    <a
                        href="${escapeHtml(url)}"
                        style="
                            display:inline-block;
                            padding:15px 26px;
                            color:#ffffff;
                            font-size:14px;
                            font-weight:700;
                            text-decoration:none;
                            border-radius:8px;
                        "
                    >
                        ${escapeHtml(label)}
                    </a>
                </td>
            </tr>
        </table>
    `;
}

/**
 * Shared Brevo email delivery function.
 *
 * Sends transactional emails through Brevo's HTTPS API.
 *
 * A successful API response confirms that Brevo accepted
 * the email submission. It does not guarantee final inbox delivery.
 */
async function sendMailAndConfirm(
    type: string,
    recipient: string,
    options: EmailMessageOptions,
): Promise<void> {
    const startedAt = Date.now();

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        EMAIL_REQUEST_TIMEOUT_MS,
    );

    try {
        const apiKey = getBrevoApiKey();

        const response = await fetch(
            `${BREVO_API_URL}/smtp/email`,
            {
                method: "POST",

                headers: {
                    "accept": "application/json",
                    "api-key": apiKey,
                    "content-type": "application/json",
                },

                body: JSON.stringify({
                    sender: {
                        name: options.from.name,
                        email: options.from.address,
                    },

                    to: [
                        {
                            email: recipient,
                        },
                    ],

                    subject: options.subject,

                    ...(options.html
                        ? {
                            htmlContent: options.html,
                        }
                        : {}),

                    ...(options.text
                        ? {
                            textContent: options.text,
                        }
                        : {}),

                    tags: [
                        "karmass",
                        type,
                    ],
                }),

                signal: controller.signal,
            },
        );

        const responseText = await response.text();

        let responseData: {
            messageId?: string;
            code?: string;
            message?: string;
        } = {};

        try {
            responseData = responseText
                ? JSON.parse(responseText)
                : {};
        } catch {
            responseData = {};
        }

        if (!response.ok) {
            const errorMessage =
                responseData.message ??
                responseData.code ??
                responseText ??
                `Brevo returned HTTP ${response.status}.`;

            throw new Error(
                `Brevo email API error (${response.status}): ${errorMessage}`,
            );
        }

        if (!responseData.messageId) {
            throw new Error(
                "Brevo accepted the request without returning a message ID.",
            );
        }

        console.info(
            "[EMAIL] Brevo submission successful",
            {
                type,
                recipient,
                messageId: responseData.messageId,
                durationMs: Date.now() - startedAt,
            },
        );
    } catch (error: unknown) {
        console.error(
            "[EMAIL] Delivery submission failed",
            {
                type,
                recipient,
                durationMs: Date.now() - startedAt,

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
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Verifies Brevo API credentials and account access.
 *
 * Requires Account: Read permission on the Brevo API key.
 */
export async function verifyEmailTransport(): Promise<void> {
    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        EMAIL_REQUEST_TIMEOUT_MS,
    );

    try {
        const apiKey = getBrevoApiKey();

        const response = await fetch(
            `${BREVO_API_URL}/account`,
            {
                method: "GET",

                headers: {
                    "accept": "application/json",
                    "api-key": apiKey,
                },

                signal: controller.signal,
            },
        );

        if (!response.ok) {
            const responseText = await response.text();

            throw new Error(
                `Brevo API verification failed (${response.status}): ${responseText}`,
            );
        }

        console.info(
            "[EMAIL] Brevo API credentials verified successfully.",
        );
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Account verification email.
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
        `${CLIENT_URL}/verify-email?token=${encodeURIComponent(input.token)}`;

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
                `Verify your email: ${verificationUrl}`,
                "",
                `This verification request expires in ${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes.`,
                "",
                "If you did not create a KARMASS account, you can ignore this email.",
                "",
                "KARMASS",
            ].join("\n"),

            html: buildEmailLayout({
                title: "Verify your KARMASS account",
                preheader: "Complete your email verification.",
                content: `
                    <p>Hello ${escapeHtml(input.firstName)},</p>

                    <p style="line-height:1.7;color:#475569;">
                        Welcome to KARMASS. Please verify your email
                        address to activate your account.
                    </p>

                    <p style="color:#475569;">
                        Your verification code is:
                    </p>

                    <div style="
                        padding:22px;
                        background:${BRAND_LIGHT};
                        border:1px solid #CDE5FF;
                        border-radius:10px;
                        text-align:center;
                    ">
                        <span style="
                            font-size:30px;
                            font-weight:800;
                            letter-spacing:8px;
                            color:${BRAND_DARK};
                        ">
                            ${escapeHtml(input.code)}
                        </span>
                    </div>

                    <p style="color:#475569;line-height:1.7;">
                        You can also verify your email using the button below.
                    </p>

                    ${buildEmailButton(
                        verificationUrl,
                        "Verify Email Address",
                    )}

                    <p style="font-size:13px;color:#64748B;">
                        This verification request expires in
                        ${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes.
                    </p>

                    <p style="font-size:13px;color:#64748B;">
                        If you did not create a KARMASS account,
                        you can ignore this email.
                    </p>
                `,
            }),
        },
    );
}

/**
 * New user registration notification for administrators.
 *
 * Sent directly to active administrators whenever a new
 * customer successfully registers on KARMASS.
 */
export async function sendNewUserRegistrationEmail(
    input: {
        email: string;
        firstName: string;

        registeredUser: {
            id: string;
            firstName: string;
            lastName: string;
            email: string;
            registeredAt: Date;
        };
    },
): Promise<void> {
    const fullName = [
        input.registeredUser.firstName,
        input.registeredUser.lastName,
    ]
        .filter(Boolean)
        .join(" ");

    const registeredAt = formatEmailDate(
        input.registeredUser.registeredAt,
    );

    const adminUsersUrl =
        `${CLIENT_URL}/admin/users?search=${encodeURIComponent(
            input.registeredUser.email,
        )}`;

    const html = buildEmailLayout({
        title: "A new user has joined KARMASS",

        preheader:
            `${fullName} has successfully registered on KARMASS.`,

        content: `
            <div style="
                display:inline-block;
                padding:7px 13px;
                background:#EAF5FF;
                color:#0877D9;
                border-radius:30px;
                font-size:11px;
                font-weight:700;
                letter-spacing:.6px;
                margin-bottom:20px;
            ">
                NEW USER REGISTRATION
            </div>

            <p style="
                margin:0 0 14px;
                font-size:15px;
                line-height:1.8;
                color:#334155;
            ">
                Hello ${escapeHtml(input.firstName)},
            </p>

            <p style="
                margin:0 0 24px;
                font-size:15px;
                line-height:1.8;
                color:#475569;
            ">
                A new user has successfully created an account
                on KARMASS. Here are the registration details
                for your review.
            </p>

            <div style="
                padding:23px;
                background:#F4F9FF;
                border:1px solid #DCEEFF;
                border-radius:12px;
                margin:20px 0 25px;
            ">

                <p style="
                    margin:0 0 19px;
                    font-size:11px;
                    font-weight:700;
                    color:#0877D9;
                    letter-spacing:1px;
                    text-transform:uppercase;
                ">
                    REGISTERED USER DETAILS
                </p>

                <table
                    role="presentation"
                    width="100%"
                    cellspacing="0"
                    cellpadding="0"
                    border="0"
                >
                    ${buildEmailDetailRow(
                        "Full name",
                        fullName,
                    )}

                    ${buildEmailDetailRow(
                        "Email address",
                        input.registeredUser.email,
                    )}

                    ${buildEmailDetailRow(
                        "Registration date",
                        registeredAt,
                    )}

                    ${buildEmailDetailRow(
                        "Account ID",
                        input.registeredUser.id,
                    )}
                </table>
            </div>

            <p style="
                margin:0 0 8px;
                font-size:14px;
                line-height:1.8;
                color:#475569;
            ">
                You can view this account, review its information
                and manage the user from your KARMASS administration
                dashboard.
            </p>

            ${buildEmailButton(
                adminUsersUrl,
                "View User in Admin Dashboard",
            )}

            <p style="
                margin:23px 0 0;
                font-size:12px;
                line-height:1.8;
                color:#94A3B8;
            ">
                This is an automated administrative notification.
                No action is required if you have already reviewed
                this registration.
            </p>
        `,
    });

    const text = [
        `Hello ${input.firstName},`,
        "",
        "A new user has successfully registered on KARMASS.",
        "",
        "NEW USER REGISTRATION",
        "",
        `Full name: ${fullName}`,
        `Email address: ${input.registeredUser.email}`,
        `Registration date: ${registeredAt}`,
        `Account ID: ${input.registeredUser.id}`,
        "",
        "View this user in your administration dashboard:",
        adminUsersUrl,
        "",
        "KARMASS Administration",
    ].join("\n");

    await sendMailAndConfirm(
        "admin-new-user-registration",
        input.email,
        {
            from: getSender(),
            to: input.email,

            subject:
                `New User Registration: ${fullName} | KARMASS`,

            text,
            html,
        },
    );
}

/**
 * General notification email.
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

            html: buildEmailLayout({
                title: input.title,
                preheader: input.message,
                content: `
                    <p>Hello ${escapeHtml(input.firstName)},</p>

                    <p style="
                        white-space:pre-wrap;
                        line-height:1.8;
                        color:#475569;
                        font-size:15px;
                    ">
                        ${escapeHtml(input.message)}
                    </p>
                `,
            }),
        },
    );
}

/**
 * Password-reset email.
 */
export async function sendPasswordResetEmail(
    input: {
        email: string;
        firstName: string;
        token: string;
    },
): Promise<void> {
    const resetUrl =
        `${CLIENT_URL}/reset-password?token=${encodeURIComponent(input.token)}`;

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

            html: buildEmailLayout({
                title: "Reset your KARMASS password",
                preheader: "Use the secure link to reset your password.",
                content: `
                    <p>Hello ${escapeHtml(input.firstName)},</p>

                    <p style="line-height:1.7;color:#475569;">
                        We received a request to reset your KARMASS password.
                    </p>

                    ${buildEmailButton(
                        resetUrl,
                        "Reset My Password",
                    )}

                    <p style="font-size:13px;color:#64748B;">
                        This link expires in
                        ${env.PASSWORD_RESET_TTL_MINUTES} minutes.
                    </p>

                    <p style="font-size:13px;color:#64748B;">
                        If you did not request a password reset,
                        you can safely ignore this email.
                    </p>
                `,
            }),
        },
    );
}

/**
 * Subscription activation confirmation email.
 *
 * Payment date, activation date and expiry date are intentionally
 * displayed separately to avoid confusing payment verification
 * with the actual subscription activation time.
 */
export async function sendSubscriptionActivatedEmail(
    input: {
        email: string;
        firstName: string;
        planName: string;
        amount: string | number;
        currency: string;
        listingCredits: number;
        paymentDate: Date;
        activationDate: Date;
        expiryDate: Date;
    },
): Promise<void> {
    const paymentDate = formatEmailDate(input.paymentDate);
    const activationDate = formatEmailDate(input.activationDate);
    const expiryDate = formatEmailDate(input.expiryDate);

    const amount = formatEmailMoney(
        input.amount,
        input.currency,
    );

    const dashboardUrl =
        `${CLIENT_URL}/dashboard/subscriptions/plans`;

    const html = buildEmailLayout({
        title: "Your subscription is now active!",
        preheader: `Your ${input.planName} subscription has been successfully activated.`,
        content: `
            <div style="
                display:inline-block;
                padding:7px 13px;
                background:${BRAND_LIGHT};
                color:${BRAND_DARK};
                border-radius:30px;
                font-size:12px;
                font-weight:700;
                margin-bottom:18px;
            ">
                SUBSCRIPTION ACTIVATED
            </div>

            <p>Hello ${escapeHtml(input.firstName)},</p>

            <p style="
                font-size:15px;
                line-height:1.8;
                color:#475569;
            ">
                Great news! Your payment has been successfully verified
                and your KARMASS subscription is now active.
            </p>

            <div style="
                margin:24px 0;
                padding:22px;
                background:${BRAND_SOFT};
                border:1px solid #DCEEFF;
                border-radius:12px;
            ">
                <p style="
                    margin:0 0 7px;
                    font-size:12px;
                    color:#64748B;
                    text-transform:uppercase;
                    letter-spacing:1px;
                ">
                    Your subscription plan
                </p>

                <h2 style="
                    margin:0;
                    font-size:23px;
                    color:${BRAND_DARK};
                ">
                    ${escapeHtml(input.planName)}
                </h2>

                <p style="
                    margin:10px 0 0;
                    font-size:14px;
                    color:#475569;
                ">
                    ${escapeHtml(amount)} paid
                </p>
            </div>

            <h3 style="
                margin:26px 0 12px;
                font-size:16px;
                color:#172033;
            ">
                Subscription details
            </h3>

            <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="
                    border:1px solid #E8EDF4;
                    border-radius:9px;
                    overflow:hidden;
                "
            >
                ${buildEmailDetailRow(
                    "Plan",
                    input.planName,
                )}

                ${buildEmailDetailRow(
                    "Payment amount",
                    amount,
                )}

                ${buildEmailDetailRow(
                    "Listing credits granted",
                    input.listingCredits.toLocaleString("en-NG"),
                )}

                ${buildEmailDetailRow(
                    "Payment date",
                    paymentDate,
                )}

                ${buildEmailDetailRow(
                    "Activation date",
                    activationDate,
                )}

                ${buildEmailDetailRow(
                    "Expiry date",
                    expiryDate,
                )}
            </table>

            <div style="
                margin-top:24px;
                padding:17px;
                background:#F0FDF4;
                border:1px solid #BBF7D0;
                border-radius:9px;
            ">
                <p style="
                    margin:0;
                    font-size:14px;
                    line-height:1.7;
                    color:#166534;
                ">
                    Your subscription benefits are now available.
                    You can visit your dashboard to manage your
                    subscription and vehicle listings.
                </p>
            </div>

            ${buildEmailButton(
                dashboardUrl,
                "Go to My Dashboard",
            )}

            <p style="
                margin-top:24px;
                font-size:13px;
                line-height:1.7;
                color:#64748B;
            ">
                Thank you for choosing KARMASS. We're glad to have
                you with us.
            </p>
        `,
    });

    const text = [
        `Hello ${input.firstName},`,
        "",
        "Your payment has been successfully verified and your KARMASS subscription is now active.",
        "",
        "SUBSCRIPTION DETAILS",
        `Plan: ${input.planName}`,
        `Payment amount: ${amount}`,
        `Listing credits granted: ${input.listingCredits}`,
        "",
        `Payment date: ${paymentDate}`,
        `Activation date: ${activationDate}`,
        `Expiry date: ${expiryDate}`,
        "",
        "Your subscription benefits are now available.",
        "",
        `Manage your subscription: ${dashboardUrl}`,
        "",
        "Thank you for choosing KARMASS.",
        "",
        "KARMASS Team",
    ].join("\n");

    await sendMailAndConfirm(
        "subscription-activated",
        input.email,
        {
            from: getSender(),
            to: input.email,
            subject: `Your ${input.planName} Subscription Is Now Active | KARMASS`,
            text,
            html,
        },
    );
}

/**
 * Subscription expiry reminder email.
 *
 * This email warns the customer that subscription access and
 * plan-specific benefits are approaching their expiry date.
 *
 * It deliberately does not claim that unused listing credits
 * will disappear when the subscription expires.
 */
export async function sendSubscriptionExpiryReminderEmail(
    input: {
        email: string;
        firstName: string;
        planName: string;
        expiryDate: Date;
        listingCredits: number;
    },
): Promise<void> {
    const expiryDate = formatEmailDate(input.expiryDate);

    const renewalUrl =
        `${CLIENT_URL}/dashboard/subscriptions/plans`;

    const html = buildEmailLayout({
        title: "Your subscription is expiring soon",
        preheader: `Your ${input.planName} subscription is approaching its expiry date.`,
        content: `
            <div style="
                display:inline-block;
                padding:7px 13px;
                background:#FFF7ED;
                color:#C2410C;
                border-radius:30px;
                font-size:12px;
                font-weight:700;
                margin-bottom:18px;
            ">
                EXPIRY REMINDER
            </div>

            <p>Hello ${escapeHtml(input.firstName)},</p>

            <p style="
                font-size:15px;
                line-height:1.8;
                color:#475569;
            ">
                This is a friendly reminder that your KARMASS
                subscription is approaching its expiry date.
            </p>

            <div style="
                margin:24px 0;
                padding:23px;
                background:${BRAND_SOFT};
                border:1px solid #DCEEFF;
                border-radius:12px;
            ">
                <p style="
                    margin:0 0 7px;
                    font-size:12px;
                    color:#64748B;
                    text-transform:uppercase;
                    letter-spacing:1px;
                ">
                    Current subscription
                </p>

                <h2 style="
                    margin:0;
                    font-size:22px;
                    color:${BRAND_DARK};
                ">
                    ${escapeHtml(input.planName)}
                </h2>

                <div style="
                    margin-top:18px;
                    padding-top:17px;
                    border-top:1px solid #DCEEFF;
                ">
                    <p style="
                        margin:0 0 5px;
                        font-size:12px;
                        color:#64748B;
                    ">
                        EXPIRY DATE
                    </p>

                    <p style="
                        margin:0;
                        font-size:17px;
                        font-weight:700;
                        color:#172033;
                    ">
                        ${escapeHtml(expiryDate)}
                    </p>
                </div>
            </div>

            <div style="
                margin:22px 0;
                padding:17px;
                background:#FFF7ED;
                border:1px solid #FED7AA;
                border-radius:9px;
            ">
                <p style="
                    margin:0;
                    font-size:14px;
                    line-height:1.8;
                    color:#9A3412;
                ">
                    When your subscription expires, access to its
                    subscription-specific benefits will end.
                    Renewing before expiry helps you maintain
                    uninterrupted access to those benefits.
                </p>
            </div>

            <p style="
                font-size:14px;
                line-height:1.8;
                color:#475569;
            ">
                You currently have
                <strong>
                    ${input.listingCredits.toLocaleString("en-NG")}
                </strong>
                listing credits recorded for your account.
                Your available credit balance can be viewed
                from your KARMASS dashboard.
            </p>

            ${buildEmailButton(
                renewalUrl,
                "Renew My Subscription",
            )}

            <p style="
                margin-top:23px;
                font-size:13px;
                line-height:1.7;
                color:#64748B;
            ">
                If you have already renewed your subscription,
                you can disregard this reminder.
            </p>
        `,
    });

    const text = [
        `Hello ${input.firstName},`,
        "",
        `Your ${input.planName} KARMASS subscription is approaching its expiry date.`,
        "",
        `Expiry date: ${expiryDate}`,
        "",
        "When your subscription expires, access to its subscription-specific benefits will end.",
        "",
        `Listing credits recorded for your account: ${input.listingCredits}`,
        "",
        "You can view your available credit balance from your dashboard.",
        "",
        `Renew your subscription: ${renewalUrl}`,
        "",
        "If you have already renewed, you can disregard this reminder.",
        "",
        "KARMASS Team",
    ].join("\n");

    await sendMailAndConfirm(
        "subscription-expiry-reminder",
        input.email,
        {
            from: getSender(),
            to: input.email,
            subject: `Your ${input.planName} Subscription Expires Soon | KARMASS`,
            text,
            html,
        },
    );
}

/**
 * Dealer application decision email.
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
        `${CLIENT_URL}/dashboard/dealer`;

    const applicationUrl =
        `${CLIENT_URL}/dashboard/dealer/applications`;

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

/**
 * Admin notification email for a successful listing boost payment.
 */
export async function sendAdminBoostPaymentReceivedEmail(
    input: {
        email: string;
        firstName: string;
        buyerName: string;
        buyerEmail: string;
        listingTitle: string;
        listingId: string;
        boostId: string;
        durationDays: number;
        planName: string;
        amount: string | number;
        currency: string;
        paymentDate: Date;
        paymentId: string;
    },
): Promise<void> {
    const amount = formatEmailMoney(
        input.amount,
        input.currency,
    );

    const paymentDate = formatEmailDate(
        input.paymentDate,
    );

    const adminUrl = `${CLIENT_URL}/admin`;

    const html = buildEmailLayout({
        title: "New Listing Boost Payment Received",
        preheader: `${input.buyerName} has successfully paid for a listing boost.`,
        content: `
            <div style="
                display:inline-block;
                padding:7px 13px;
                background:#EAF5FF;
                color:${BRAND_DARK};
                border-radius:30px;
                font-size:12px;
                font-weight:700;
                margin-bottom:18px;
            ">
                BOOST PAYMENT RECEIVED
            </div>

            <p>Hello ${escapeHtml(input.firstName)},</p>

            <p style="
                font-size:15px;
                line-height:1.8;
                color:#475569;
            ">
                A customer has successfully completed payment
                for a listing boost on KARMASS.
            </p>

            <div style="
                margin:24px 0;
                padding:22px;
                background:${BRAND_SOFT};
                border:1px solid #DCEEFF;
                border-radius:12px;
            ">
                <p style="
                    margin:0 0 7px;
                    font-size:12px;
                    color:#64748B;
                    text-transform:uppercase;
                    letter-spacing:1px;
                ">
                    Payment received
                </p>

                <h2 style="
                    margin:0;
                    font-size:27px;
                    color:${BRAND_DARK};
                ">
                    ${escapeHtml(amount)}
                </h2>

                <p style="
                    margin:9px 0 0;
                    font-size:13px;
                    color:#64748B;
                ">
                    Successful listing boost payment
                </p>
            </div>

            <h3 style="
                margin:26px 0 12px;
                font-size:16px;
                color:#172033;
            ">
                Customer details
            </h3>

            <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="
                    border:1px solid #E8EDF4;
                    border-radius:9px;
                    overflow:hidden;
                "
            >
                ${buildEmailDetailRow(
                    "Customer",
                    input.buyerName,
                )}

                ${buildEmailDetailRow(
                    "Email address",
                    input.buyerEmail,
                )}
            </table>

            <h3 style="
                margin:26px 0 12px;
                font-size:16px;
                color:#172033;
            ">
                Boost details
            </h3>

            <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="
                    border:1px solid #E8EDF4;
                    border-radius:9px;
                    overflow:hidden;
                "
            >
                ${buildEmailDetailRow(
                    "Listing",
                    input.listingTitle,
                )}

                ${buildEmailDetailRow(
                    "Boost plan",
                    input.planName,
                )}

                ${buildEmailDetailRow(
                    "Amount paid",
                    amount,
                )}

                ${buildEmailDetailRow(
                    "Payment date",
                    paymentDate,
                )}

                ${buildEmailDetailRow(
                    "Payment ID",
                    input.paymentId,
                )}

                ${buildEmailDetailRow(
                    "Boost ID",
                    input.boostId,
                )}
            </table>

            <div style="
                margin-top:22px;
                padding:16px;
                background:#F0FDF4;
                border:1px solid #BBF7D0;
                border-radius:9px;
            ">
                <p style="
                    margin:0;
                    font-size:14px;
                    line-height:1.7;
                    color:#166534;
                ">
                    The payment has been successfully recorded.
                    You can review the transaction and manage
                    the boost from your admin dashboard.
                </p>
            </div>

            ${buildEmailButton(
                adminUrl,
                "Open Admin Dashboard",
            )}
        `,
    });

    const text = [
        `Hello ${input.firstName},`,
        "",
        "A customer has successfully paid for a KARMASS listing boost.",
        "",
        "PAYMENT DETAILS",
        `Customer: ${input.buyerName}`,
        `Customer email: ${input.buyerEmail}`,
        `Listing: ${input.listingTitle}`,
        `Boost plan: ${input.planName}`,
        `Amount: ${amount}`,
        `Payment date: ${paymentDate}`,
        `Payment ID: ${input.paymentId}`,
        `Boost ID: ${input.boostId}`,
        "",
        `Admin dashboard: ${adminUrl}`,
        "",
        "KARMASS Team",
    ].join("\n");

    await sendMailAndConfirm(
        "admin-boost-payment-received",
        input.email,
        {
            from: getSender(),
            to: input.email,
            subject: `New Listing Boost Payment Received | KARMASS`,
            text,
            html,
        },
    );
}

/**
 * Listing boost expiry reminder email.
 *
 * Sent 24 hours before an active listing boost expires.
 */
export async function sendBoostExpiryReminderEmail(
    input: {
        email: string;
        firstName: string;
        listingTitle: string;
        expiryDate: Date;
        listingId: string;
    },
): Promise<void> {
    const expiryDate = formatEmailDate(
        input.expiryDate,
    );

    /**
     * IMPORTANT:
     * This assumes the frontend reboost page uses this route.
     * Change it if your actual KARMASS reboost route differs.
     */
    const reboostUrl =
        `${CLIENT_URL}/dashboard/listings/${encodeURIComponent(input.listingId)}/boost`;

    const html = buildEmailLayout({
        title: "Your listing boost expires tomorrow",
        preheader: `Your boost for ${input.listingTitle} expires in approximately 24 hours.`,
        content: `
            <div style="
                display:inline-block;
                padding:7px 13px;
                background:#FFF7ED;
                color:#C2410C;
                border-radius:30px;
                font-size:12px;
                font-weight:700;
                margin-bottom:18px;
            ">
                BOOST EXPIRY REMINDER
            </div>

            <p>Hello ${escapeHtml(input.firstName)},</p>

            <p style="
                font-size:15px;
                line-height:1.8;
                color:#475569;
            ">
                Your KARMASS listing boost is scheduled to expire
                in approximately 24 hours.
            </p>

            <div style="
                margin:24px 0;
                padding:22px;
                background:${BRAND_SOFT};
                border:1px solid #DCEEFF;
                border-radius:12px;
            ">
                <p style="
                    margin:0 0 8px;
                    font-size:12px;
                    color:#64748B;
                    text-transform:uppercase;
                    letter-spacing:1px;
                ">
                    Boosted listing
                </p>

                <h2 style="
                    margin:0;
                    font-size:21px;
                    line-height:1.5;
                    color:${BRAND_DARK};
                ">
                    ${escapeHtml(input.listingTitle)}
                </h2>

                <div style="
                    margin-top:18px;
                    padding-top:17px;
                    border-top:1px solid #DCEEFF;
                ">
                    <p style="
                        margin:0 0 6px;
                        font-size:12px;
                        color:#64748B;
                    ">
                        BOOST EXPIRY DATE
                    </p>

                    <p style="
                        margin:0;
                        font-size:17px;
                        font-weight:700;
                        color:#172033;
                    ">
                        ${escapeHtml(expiryDate)}
                    </p>
                </div>
            </div>

            <p style="
                font-size:15px;
                line-height:1.8;
                color:#475569;
            ">
                Don't lose the additional visibility your listing
                currently receives. You can purchase another boost
                before the current one expires.
            </p>

            ${buildEmailButton(
                reboostUrl,
                "Reboost My Listing",
            )}

            <p style="
                margin-top:22px;
                font-size:13px;
                line-height:1.7;
                color:#64748B;
            ">
                If you have already purchased another boost,
                you can disregard this reminder.
            </p>
        `,
    });

    const text = [
        `Hello ${input.firstName},`,
        "",
        "Your KARMASS listing boost is scheduled to expire in approximately 24 hours.",
        "",
        `Listing: ${input.listingTitle}`,
        `Expiry date: ${expiryDate}`,
        "",
        "You can purchase another boost before the current one expires.",
        "",
        `Reboost your listing: ${reboostUrl}`,
        "",
        "If you have already purchased another boost, you can disregard this reminder.",
        "",
        "KARMASS Team",
    ].join("\n");

    await sendMailAndConfirm(
        "boost-expiry-reminder",
        input.email,
        {
            from: getSender(),
            to: input.email,
            subject: "Your KARMASS Listing Boost Expires Tomorrow",
            text,
            html,
        },
    );
}