import type { Job } from "bullmq";
import { logger } from "../../config/logger.ts";
import { sendPasswordResetEmail } from "../../modules/email-module/email.service.ts";

export interface PasswordResetEmailJob {
    type: "PASSWORD_RESET";
    email: string;
    firstName: string;
    token: string;
}

export async function handleEmailJob(
    job: Job<PasswordResetEmailJob>,
): Promise<void> {
    const data = job.data;

    switch (data.type) {
        case "PASSWORD_RESET": {
            logger.info(
                {
                    jobId: job.id,
                    type: data.type,
                },
                "Processing password reset email",
            );

            await sendPasswordResetEmail({
                email: data.email,
                firstName: data.firstName,
                token: data.token,
            });

            logger.info(
                {
                    jobId: job.id,
                    type: data.type,
                },
                "Password reset email processed successfully",
            );

            return;
        }

        default: {
            throw new Error(
                `Unsupported email job type: ${data.type}`,
            );
        }
    }
}