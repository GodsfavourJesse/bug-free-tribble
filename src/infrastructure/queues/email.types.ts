export interface PasswordResetEmailJob {
    type: "PASSWORD_RESET";
    email: string;
    firstName: string;
    token: string;
}

export type EmailJobData = PasswordResetEmailJob;