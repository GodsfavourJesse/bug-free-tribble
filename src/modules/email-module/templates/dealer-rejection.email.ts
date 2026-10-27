export interface DealerRejectionEmailData {
    firstName: string;
    companyName: string;
    rejectionReason: string;
    applicationUrl: string;
    reviewDate: string;
}

export function buildDealerRejectionEmail({
    firstName,
    companyName,
    rejectionReason,
    applicationUrl,
    reviewDate,
}: DealerRejectionEmailData): string {
    const escapeHtml = (value: string): string =>
        value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    const name = escapeHtml(firstName.trim() || "there");
    const company = escapeHtml(companyName);
    const reason = escapeHtml(rejectionReason);
    const date = escapeHtml(reviewDate);

    const safeUrl = new URL(applicationUrl);

    if (
        safeUrl.protocol !== "https:" &&
        safeUrl.hostname !== "localhost"
    ) {
        throw new Error("Invalid application URL.");
    }

    const buttonUrl = escapeHtml(safeUrl.toString());

    return `<!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="color-scheme" content="light">
            <meta name="supported-color-schemes" content="light">
            <title>Your KARMASS Dealer Application Update</title>
        </head>

        <body style="margin:0;padding:0;background-color:#f4f5f9;font-family:Arial,Helvetica,sans-serif;color:#252238;">

            <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
                An update regarding your KARMASS dealer application and the next steps available to you.
            </div>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f5f9;">
                <tr>
                    <td align="center" style="padding:32px 14px;">

                        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;">

                            <!-- BRAND HEADER -->
                            <tr>
                                <td style="padding:27px 30px;border-bottom:1px solid #eeeaf5;">
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                        <tr>
                                            <td>
                                                <div style="font-size:28px;font-weight:800;letter-spacing:-1.2px;color:#7008E7;">
                                                    KARMASS<span style="color:#252238;">.</span>
                                                </div>
                                                <div style="margin-top:5px;font-size:10px;letter-spacing:1.5px;color:#858399;text-transform:uppercase;">
                                                    Your automotive marketplace
                                                </div>
                                            </td>
                                            <td align="right" valign="middle">
                                                <span style="display:inline-block;padding:8px 10px;background-color:#f2eaff;color:#7008E7;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px;">
                                                    DEALER ACCOUNT
                                                </span>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <!-- STATUS HERO -->
                            <tr>
                                <td style="padding:36px 30px 30px;background-color:#faf8ff;border-bottom:1px solid #eee7fb;">

                                    <div style="width:48px;height:48px;line-height:48px;text-align:center;background-color:#fff0f0;color:#b42318;border-radius:14px;font-size:26px;font-weight:700;">
                                        !
                                    </div>

                                    <div style="margin-top:23px;font-size:11px;font-weight:700;letter-spacing:1.6px;color:#7008E7;">
                                        APPLICATION UPDATE
                                    </div>

                                    <h1 style="margin:10px 0 0;font-size:28px;line-height:37px;letter-spacing:-.7px;color:#252238;">
                                        An update on your dealer application
                                    </h1>

                                    <p style="margin:14px 0 0;font-size:15px;line-height:26px;color:#69657b;">
                                        Hello ${name}, thank you for your interest in becoming a verified dealer on KARMASS.
                                    </p>
                                </td>
                            </tr>

                            <!-- MAIN CONTENT -->
                            <tr>
                                <td style="padding:30px 30px 10px;">

                                    <p style="margin:0 0 16px;font-size:15px;line-height:26px;color:#555267;">
                                        We appreciate the time and effort you invested in submitting your dealer application.
                                    </p>

                                    <p style="margin:0 0 24px;font-size:15px;line-height:26px;color:#555267;">
                                        Following a review of your submission, we are unable to approve your application at this time. The details below explain the issue identified during the review.
                                    </p>

                                    <!-- APPLICATION DETAILS -->
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e9e5f1;border-radius:12px;">
                                        <tr>
                                            <td style="padding:17px 20px;background-color:#faf9fc;border-bottom:1px solid #e9e5f1;">
                                                <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#89859a;">
                                                    APPLICATION DETAILS
                                                </div>
                                            </td>
                                        </tr>

                                        <tr>
                                            <td style="padding:21px;">

                                                <div style="font-size:12px;color:#89859a;margin-bottom:6px;">
                                                    Registered business
                                                </div>

                                                <div style="font-size:16px;line-height:24px;font-weight:700;color:#29253b;overflow-wrap:anywhere;margin-bottom:20px;">
                                                    ${company}
                                                </div>

                                                <div style="font-size:12px;color:#89859a;margin-bottom:8px;">
                                                    Application status
                                                </div>

                                                <div style="margin-bottom:20px;">
                                                    <span style="display:inline-block;padding:7px 11px;border-radius:6px;background-color:#fff0f0;color:#b42318;font-size:12px;font-weight:700;">
                                                        NOT APPROVED
                                                    </span>
                                                </div>

                                                <div style="font-size:12px;color:#89859a;margin-bottom:6px;">
                                                    Review date
                                                </div>

                                                <div style="font-size:14px;line-height:22px;color:#29253b;">
                                                    ${date}
                                                </div>

                                            </td>
                                        </tr>
                                    </table>

                                    <!-- REJECTION REASON -->
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;background-color:#fff8f2;border:1px solid #f5dfce;border-radius:10px;">
                                        <tr>
                                            <td style="padding:20px;">

                                                <div style="margin-bottom:10px;font-size:11px;font-weight:700;letter-spacing:1px;color:#a34b17;">
                                                    REASON FOR NON-APPROVAL
                                                </div>

                                                <p style="margin:0;font-size:14px;line-height:24px;color:#75421f;overflow-wrap:anywhere;">
                                                    ${reason}
                                                </p>

                                            </td>
                                        </tr>
                                    </table>

                                    <!-- NEXT STEPS -->
                                    <h2 style="margin:30px 0 12px;font-size:19px;line-height:27px;color:#29253b;">
                                        How to proceed
                                    </h2>

                                    <p style="margin:0 0 14px;font-size:14px;line-height:25px;color:#666176;">
                                        Please review the reason provided and address the identified issue. If the concern relates to your verification documents, ensure that you submit valid, legible, and up-to-date documentation.
                                    </p>

                                    <p style="margin:0 0 25px;font-size:14px;line-height:25px;color:#666176;">
                                        You can revisit your application details using the button below. If you need further clarification, please contact KARMASS support.
                                    </p>

                                    <!-- CTA BUTTON -->
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 29px;">
                                        <tr>
                                            <td align="center" bgcolor="#7008E7" style="border-radius:8px;background-color:#7008E7;">
                                                <a href="${buttonUrl}" target="_blank" style="display:inline-block;padding:15px 26px;border-radius:8px;color:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:700;">
                                                    Review My Application &nbsp; &#8594;
                                                </a>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="margin:0 0 28px;font-size:14px;line-height:25px;color:#666176;">
                                        This decision does not diminish our appreciation for your interest in KARMASS. We encourage you to address the issue identified and follow the application process available to you.
                                    </p>

                                    <p style="margin:0 0 28px;font-size:14px;line-height:24px;color:#555267;">
                                        Thank you for your understanding.
                                    </p>

                                </td>
                            </tr>

                            <!-- FOOTER -->
                            <tr>
                                <td style="padding:25px 30px;background-color:#f9f8fc;border-top:1px solid #eeeaf5;">

                                    <div style="font-size:18px;font-weight:800;letter-spacing:-.5px;color:#7008E7;">
                                        KARMASS.
                                    </div>

                                    <p style="margin:9px 0 17px;font-size:12px;line-height:21px;color:#858197;">
                                        Connecting automotive businesses with opportunities.
                                    </p>

                                    <div style="height:1px;background-color:#e9e5f0;margin-bottom:16px;"></div>

                                    <p style="margin:0 0 8px;font-size:11px;line-height:18px;color:#9692a5;">
                                        This is an official account notification regarding your dealer application.
                                    </p>

                                    <p style="margin:0;font-size:11px;line-height:18px;color:#9692a5;">
                                        &copy; ${new Date().getFullYear()} KARMASS. All rights reserved.
                                    </p>

                                </td>
                            </tr>

                        </table>

                        <p style="max-width:520px;margin:20px 0 0;font-size:11px;line-height:19px;text-align:center;color:#9995a8;">
                            Please do not reply to this automated email unless your email provider directs replies to our support team.
                        </p>

                    </td>
                </tr>
            </table>

        </body>
    </html>`;
}