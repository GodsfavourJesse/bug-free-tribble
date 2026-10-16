import type {
    NextFunction,
    Request,
    Response,
} from "express";

import type {
    ZodType,
} from "zod";

import {
    AppError,
} from "../errors/app-error.ts";

type RequestPart =
    | "body"
    | "query"
    | "params";

export function validate(
    schema: ZodType,
    part: RequestPart = "body",
) {
    return (
        request: Request,
        _response: Response,
        next: NextFunction,
    ): void => {
        const result =
            schema.safeParse(
                request[part],
            );

        if (!result.success) {
            next(
                new AppError(
                    "Request validation failed.",
                    400,
                    "VALIDATION_ERROR",
                    result.error
                        .issues,
                ),
            );

            return;
        }

        (
            request as unknown as Record<
                string,
                unknown
            >
        )[part] =
            result.data;

        next();
    };
}