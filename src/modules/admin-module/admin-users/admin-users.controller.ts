import type {
    Request,
    Response,
} from "express";

import {
    getAdminUserById,
    getAdminUserStats,
    listAdminUsers,
} from "./admin-users.service.ts";

import {
    adminUserIdSchema,
    adminUsersQuerySchema,
} from "./admin-users.validation.ts";

export async function listAdminUsersController(
    request: Request,
    response: Response,
): Promise<void> {
    const query = adminUsersQuerySchema.parse(
        request.query,
    );

    const result = await listAdminUsers(query);

    response.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
    });
}

export async function getAdminUserController(
    request: Request,
    response: Response,
): Promise<void> {
    const params = adminUserIdSchema.parse(
        request.params,
    );

    const user = await getAdminUserById(
        params.userId,
    );

    response.status(200).json({
        success: true,
        data: user,
    });
}

export async function getAdminUserStatsController(
    _request: Request,
    response: Response,
): Promise<void> {
    const stats = await getAdminUserStats();

    response.status(200).json({
        success: true,
        data: stats,
    });
}