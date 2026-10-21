import type {
    Request,
    Response,
} from "express";

import { eq } from "drizzle-orm";

import { z } from "zod";

import { db } from "../../../database/index.ts";

import { users } from "../../../database/schema/index.ts";

import { AppError } from "../../../errors/app-error.ts";

import {
    sendNotificationEmail,
} from "../../email/email.service.ts";

const sendUserEmailParamsSchema = z.object({
    userId: z.string().uuid(),
});

const sendUserEmailBodySchema = z.object({
    subject: z
        .string()
        .trim()
        .min(3, "Email subject must contain at least 3 characters.")
        .max(150, "Email subject cannot exceed 150 characters."),

    message: z
        .string()
        .trim()
        .min(3, "Email message must contain at least 3 characters.")
        .max(10000, "Email message cannot exceed 10000 characters."),
});

export async function sendAdminUserEmailController(
    request: Request,
    response: Response,
): Promise<void> {
    const { userId } = sendUserEmailParamsSchema.parse(
        request.params,
    );

    const input = sendUserEmailBodySchema.parse(
        request.body,
    );

    const result = await db
        .select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            status: users.status,
        })
        .from(users)
        .where(
            eq(users.id, userId),
        )
        .limit(1);

    const user = result[0];

    if (!user) {
        throw new AppError(
            "User account was not found.",
            404,
            "USER_NOT_FOUND",
        );
    }

    if (user.status !== "ACTIVE") {
        throw new AppError(
            "Email cannot be sent to an inactive user account.",
            400,
            "USER_NOT_ACTIVE",
        );
    }

    await sendNotificationEmail({
        email: user.email,
        firstName: user.firstName,
        title: input.subject,
        message: input.message,
    });

    response.status(200).json({
        success: true,
        message: "Email submitted successfully.",
        data: {
            userId: user.id,
            email: user.email,
            subject: input.subject,
        },
    });
}