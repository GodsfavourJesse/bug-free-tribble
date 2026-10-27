import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.ts";

export const errorHandler: ErrorRequestHandler = (
    error,
    request,
    response,
    _next,
) => {
    const requestId = request.requestId;

    const errorDetails = {
        requestId,
        method: request.method,
        path: request.originalUrl,
        errorName:
            error instanceof Error
                ? error.name
                : typeof error,
        errorMessage:
            error instanceof Error
                ? error.message
                : String(error),
        stack:
            error instanceof Error
                ? error.stack
                : undefined,
        cause:
            error instanceof Error
                ? error.cause
                : undefined,
    };

    // Log the original error on the server.
    request.log.error(
        {
            err: error,
            ...errorDetails,
        },
        "Unhandled application error",
    );

    // Preserve structured application errors.
    if (error instanceof AppError) {
        response.status(error.statusCode).json({
            success: false,
            error: {
                code: error.code,
                message: error.message,
                ...(error.details !== undefined
                    ? { details: error.details }
                    : {}),
            },
            requestId,
        });

        return;
    }

    // Handle request validation errors.
    if (error instanceof ZodError) {
        response.status(400).json({
            success: false,
            error: {
                code: "VALIDATION_ERROR",
                message: "Request validation failed.",
                details: error.issues,
            },
            requestId,
        });

        return;
    }

    // Handle malformed JSON requests.
    if (error instanceof SyntaxError) {
        response.status(400).json({
            success: false,
            error: {
                code: "INVALID_JSON",
                message: "The request body contains invalid JSON.",
            },
            requestId,
        });

        return;
    }

    // Keep unexpected errors generic for clients.
    response.status(500).json({
        success: false,
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message:
                "An unexpected server error occurred. Please try again.",
        },
        requestId,
    });
};