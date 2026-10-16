import type {
    NextFunction,
    Request,
    Response,
} from "express";
import { verifyAdminCsrfToken } from "../../helpers/auth/csrf-helpers/admin.csrf.ts";


const SAFE_METHODS = new Set([
    "GET",
    "HEAD",
    "OPTIONS",
]);

const ADMIN_SESSION_COOKIE =
    "karmass_admin_session";

export function requireAdminCsrfToken(
    request: Request,
    response: Response,
    next: NextFunction,
): void {
    if (
        SAFE_METHODS.has(
            request.method,
        )
    ) {
        next();
        return;
    }

    const sessionToken =
        request.cookies?.[
            ADMIN_SESSION_COOKIE
        ];

    const suppliedToken =
        request.get("X-CSRF-Token");

    if (
        typeof sessionToken !== "string" ||
        typeof suppliedToken !== "string" ||
        !verifyAdminCsrfToken(
            sessionToken,
            suppliedToken,
        )
    ) {
        response
            .status(403)
            .json({
                success: false,
                error: {
                    code:
                        "ADMIN_CSRF_VALIDATION_FAILED",
                    message:
                        "Your administrator request could not be verified. Refresh the page and try again.",
                },
            });

        return;
    }

    next();
}