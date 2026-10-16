import type {
    ErrorRequestHandler,
} from "express";

import {
    ZodError,
} from "zod";

import {
    AppError,
} from "../errors/app-error.ts";


export const errorHandler: ErrorRequestHandler =
    (
        error,
        request,
        response,
        _next,
    ) => {
        request.log.error(
            {
                err: error,
                requestId:
                    request.requestId,
                method:
                    request.method,
                path:
                    request.originalUrl,
            },
            "Unhandled application error",
        );

        if (
            error instanceof
            AppError
        ) {
            response
                .status(
                    error.statusCode,
                )
                .json({
                    success: false,

                    error: {
                        code:
                            error.code,

                        message:
                            error.message,

                        ...(error.details !==
                        undefined
                            ? {
                                  details:
                                      error.details,
                              }
                            : {}),
                    },

                    requestId:
                        request.requestId,
                });

            return;
        }

        if (
            error instanceof
            ZodError
        ) {
            response
                .status(400)
                .json({
                    success: false,

                    error: {
                        code:
                            "VALIDATION_ERROR",

                        message:
                            "Request validation failed.",

                        details:
                            error.issues,
                    },

                    requestId:
                        request.requestId,
                });

            return;
        }

        if (
            error instanceof
            SyntaxError
        ) {
            response
                .status(400)
                .json({
                    success: false,

                    error: {
                        code:
                            "INVALID_JSON",

                        message:
                            "The request body contains invalid JSON.",
                    },

                    requestId:
                        request.requestId,
                });

            return;
        }

        response
            .status(500)
            .json({
                success: false,

                error: {
                    code:
                        "INTERNAL_SERVER_ERROR",

                    message: "An unexpected server error occurred. Please try again.",
                },

                requestId:
                    request.requestId,
            });
    };