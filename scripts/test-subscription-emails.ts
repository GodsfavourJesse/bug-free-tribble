import nodeProcess from "node:process";

import {
    verifyEmailTransport,
    sendSubscriptionActivatedEmail,
    sendSubscriptionExpiryReminderEmail,
} from "../src/modules/email-module/email.service.ts";

async function main(): Promise<void> {
    const recipient = nodeProcess.argv[2]?.trim();

    if (!recipient) {
        throw new Error(
            "Please provide a recipient email address.\n" +
            "Usage: npm run test:subscription-emails -- your@email.com",
        );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(recipient)) {
        throw new Error("Please provide a valid email address.");
    }

    console.info("\n======================================");
    console.info(" KARMASS SUBSCRIPTION EMAIL TEST");
    console.info("======================================\n");

    // 1. Verify SMTP connection.
    console.info("[1/3] Verifying SMTP connection...");

    await verifyEmailTransport();

    console.info("SMTP connection and authentication successful.\n");

    const now = new Date();

    const paymentDate = new Date(
        now.getTime() - 5 * 60 * 1000,
    );

    const activationDate = now;

    const expiryDate = new Date(now);

    expiryDate.setDate(expiryDate.getDate() + 30);

    // 2. Send subscription activation email.
    console.info("[2/3] Sending activation confirmation email...");

    await sendSubscriptionActivatedEmail({
        email: recipient,
        firstName: "KARMASS Test",
        planName: "Professional Dealer Plan",
        amount: 75000,
        currency: "NGN",
        listingCredits: 25,
        paymentDate,
        activationDate,
        expiryDate,
    });

    console.info("Activation email submitted successfully.\n");

    // 3. Send subscription expiry reminder.
    console.info("[3/3] Sending expiry reminder email...");

    const reminderExpiryDate = new Date(now);

    reminderExpiryDate.setDate(
        reminderExpiryDate.getDate() + 3,
    );

    await sendSubscriptionExpiryReminderEmail({
        email: recipient,
        firstName: "KARMASS Test",
        planName: "Professional Dealer Plan",
        expiryDate: reminderExpiryDate,
        listingCredits: 25,
    });

    console.info("Expiry reminder submitted successfully.\n");

    console.info("======================================");
    console.info(" EMAIL TEST COMPLETED SUCCESSFULLY");
    console.info("======================================");
    console.info(`Recipient: ${recipient}`);
    console.info("Emails sent: 2");
    console.info("======================================\n");
}

main().catch((error: unknown) => {
    console.error("\nKARMASS EMAIL TEST FAILED:");

    console.error(
        error instanceof Error
            ? error.message
            : String(error),
    );

    nodeProcess.exitCode = 1;
});