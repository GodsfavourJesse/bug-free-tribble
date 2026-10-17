import "dotenv/config";

import {
    verifyEmailTransport,
} from "../src/modules/email/email.service.ts";

async function main(): Promise<void> {
    try {
        await verifyEmailTransport();

        console.log(
            "SMTP connection verified successfully.",
        );
    } catch (error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : "Unknown SMTP connection error.";

        console.error(
            "SMTP connection verification failed:",
            message,
        );

        process.exitCode = 1;
    }
}

await main();