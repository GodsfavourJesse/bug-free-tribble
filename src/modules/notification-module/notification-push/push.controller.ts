import type {
    Request,
    Response,
} from "express";

import { z } from "zod";

import {
    registerPushSubscription,
    unregisterPushSubscription,
} from "./push.service.ts";

const pushSubscriptionSchema = z.object({
    endpoint: z.string().url().max(2000),

    keys: z.record(
        z.string(),
        z.unknown(),
    ),

    userAgent: z
        .string()
        .max(500)
        .optional(),

    deviceName: z
        .string()
        .max(120)
        .optional(),
});

export async function register(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const parsed =
        pushSubscriptionSchema.safeParse(
            request.body,
        );

    if (!parsed.success) {
        response.status(400).json({
            success: false,
            message: "Invalid push subscription.",
            errors: parsed.error.flatten(),
        });

        return;
    }

    const input = {
        endpoint: parsed.data.endpoint,
        keys: parsed.data.keys,

        ...(parsed.data.userAgent !== undefined
            ? {
                  userAgent:
                      parsed.data.userAgent,
              }
            : {}),

        ...(parsed.data.deviceName !== undefined
            ? {
                  deviceName:
                      parsed.data.deviceName,
              }
            : {}),
    };

    try {
        const subscription =
            await registerPushSubscription(
                user.id,
                input,
            );

        response.status(201).json({
            success: true,
            data: {
                subscription,
            },
        });
    } catch {
        response.status(500).json({
            success: false,
            message:
                "Failed to register push subscription.",
        });
    }
}

export async function unregister(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const endpointSchema = z.object({
        endpoint: z.string().url().max(2000),
    });

    const parsed =
        endpointSchema.safeParse(
            request.body,
        );

    if (!parsed.success) {
        response.status(400).json({
            success: false,
            message: "A valid endpoint URL is required.",
        });

        return;
    }

    try {
        await unregisterPushSubscription(
            user.id,
            parsed.data.endpoint,
        );

        response.status(204).send();
    } catch (error) {
        response.status(500).json({
            success: false,
            message:
                "Failed to unregister push subscription.",
        });
    }
}