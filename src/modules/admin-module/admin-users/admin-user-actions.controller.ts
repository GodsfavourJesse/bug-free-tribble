import type {
    NextFunction,
    Request,
    Response,
} from "express";

import { z } from "zod";

import {
    changeUserStatus,
    replaceUserRoles,
} from "./admin-user-actions.service.ts";

const userIdParamsSchema = z.object({
    userId: z.string().uuid(),
});

const statusActionSchema = z.object({
    reason: z.string().trim().min(3).max(1000).optional(),
});

const rolesSchema = z.object({
    roles: z.array(
        z.enum(["SUPER_ADMIN", "ADMIN", "SUPPORT", "CUSTOMER"]),
    ).min(1).max(4),
});

function getUserId(request: Request): string {
    return userIdParamsSchema.parse(request.params).userId;
}

function getActorId(request: Request): string {
    const adminId = request.admin?.id;
    if (!adminId) {
        throw new Error("Administrator authentication required.");
    }
    return adminId;
}

function getMetadata(request: Request) {
    const userAgent = request.get("user-agent");

    return {
        ...(request.ip !== undefined ? { ipAddress: request.ip } : {}),
        ...(userAgent !== undefined ? { userAgent } : {}),
    };
}

async function updateStatus(
    request: Request,
    response: Response,
    next: NextFunction,
    action: "SUSPEND" | "UNSUSPEND" | "DELETE",
): Promise<void> {
    try {
        const userId = getUserId(request);
        const actorId = getActorId(request);
        const body = statusActionSchema.parse(request.body ?? {});
        const result = await changeUserStatus({
            userId,
            actorId,
            action,
            ...(body.reason !== undefined ? { reason: body.reason } : {}),
            ...getMetadata(request),
        });

        response.status(200).json({
            success: true,
            message:
                action === "SUSPEND"
                    ? "User suspended and active sessions revoked."
                    : action === "UNSUSPEND"
                      ? "User unsuspended successfully."
                      : "User soft-deleted and active sessions revoked.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

export async function suspendAdminUser(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    return updateStatus(request, response, next, "SUSPEND");
}

export async function unsuspendAdminUser(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    return updateStatus(request, response, next, "UNSUSPEND");
}

export async function deleteAdminUser(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    return updateStatus(request, response, next, "DELETE");
}

export async function setAdminUserRoles(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const userId = getUserId(request);
        const actorId = getActorId(request);
        const body = rolesSchema.parse(request.body);

        const result = await replaceUserRoles({
            userId,
            actorId,
            roleNames: body.roles,
            ...getMetadata(request),
        });

        response.status(200).json({
            success: true,
            message: "User roles updated successfully.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
}
