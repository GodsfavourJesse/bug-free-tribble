import type {
    Request,
    Response,
    NextFunction,
} from "express";

import {
    getAdminDashboard,
    getAdminSystemHealth,
} from "./admin-dashboard.service.ts";

export async function dashboard(
    _request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const data = await getAdminDashboard();

        response.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        next(error);
    }
}

export async function systemHealth(
    _request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const data = await getAdminSystemHealth();

        response.status(data.status === "healthy" ? 200 : 503).json({
            success: data.status === "healthy",
            data,
        });
    } catch (error) {
        next(error);
    }
}
