import "dotenv/config";

import {
    verifyEmailTransport,
} from "../src/modules/email-module/email.service.ts";

async function main(): Promise<void> {
    console.info("");
    console.info("======================================");
    console.info(" KARMASS SMTP CONNECTION TEST");
    console.info("======================================");
    console.info("");

    console.info("[1/2] Checking SMTP configuration...");

    try {
        await verifyEmailTransport();

        console.info("");
        console.info("SMTP connection verified successfully.");
        console.info("SMTP authentication successful.");

        console.info("");
        console.info("======================================");
        console.info(" EMAIL TRANSPORT IS READY");
        console.info("======================================");
        console.info("");

    } catch (error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        console.error("");
        console.error("SMTP CONNECTION FAILED");
        console.error("");

        console.error(message);

        console.error("");
        console.error("Check the following environment variables:");
        console.error("- EMAIL_FROM");
        console.error("- SMTP_HOST");
        console.error("- SMTP_PORT");
        console.error("- SMTP_USER");
        console.error("- SMTP_PASSWORD");

        console.error("");

        process.exitCode = 1;
    }
}

await main();