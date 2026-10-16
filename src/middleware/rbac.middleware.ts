import type {
    NextFunction,
    Request,
    Response,
} from "express";

import { AppError } from "../errors/app-error.ts";

import type {
    Permission,
} from "../modules/rbac/rbac.constants.ts";

import {
    userHasAllPermissions,
    userHasAnyPermission,
} from "../modules/rbac/rbac.service.ts";

export function requirePermission(
    permission: Permission,
) {
    return async (
        request: Request,
        _response: Response,
        next: NextFunction,
    ): Promise<void> => {
        try {
            const user =
                request.user;

            if (!user) {
                throw new AppError(
                    "Authentication required.",
                    401,
                    "AUTHENTICATION_REQUIRED",
                );
            }

            const allowed =
                await userHasAllPermissions(
                    user.id,
                    [permission],
                );

            if (!allowed) {
                throw new AppError(
                    "You do not have permission to perform this action.",
                    403,
                    "FORBIDDEN",
                );
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

export function requirePermissions(
    ...permissions: Permission[]
) {
    return async (
        request: Request,
        _response: Response,
        next: NextFunction,
    ): Promise<void> => {
        try {
            const user =
                request.user;

            if (!user) {
                throw new AppError(
                    "Authentication required.",
                    401,
                    "AUTHENTICATION_REQUIRED",
                );
            }

            const allowed =
                await userHasAllPermissions(
                    user.id,
                    permissions,
                );

            if (!allowed) {
                throw new AppError(
                    "You do not have permission to perform this action.",
                    403,
                    "FORBIDDEN",
                );
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

export function requireAnyPermission(
    ...permissions: Permission[]
) {
    return async (
        request: Request,
        _response: Response,
        next: NextFunction,
    ): Promise<void> => {
        try {
            const user =
                request.user;

            if (!user) {
                throw new AppError(
                    "Authentication required.",
                    401,
                    "AUTHENTICATION_REQUIRED",
                );
            }

            const allowed =
                await userHasAnyPermission(
                    user.id,
                    permissions,
                );

            if (!allowed) {
                throw new AppError(
                    "You do not have permission to perform this action.",
                    403,
                    "FORBIDDEN",
                );
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}