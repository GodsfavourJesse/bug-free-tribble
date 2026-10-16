import { randomUUID } from "node:crypto";

import type {
    NextFunction,
    Request,
    Response,
} from "express";

export function requestIdMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
): void {
    const incomingId = request.header(
        "x-request-id",
    );

    const requestId = incomingId &&
        incomingId.length <= 128
            ? incomingId
            : randomUUID();

    request.requestId = requestId;

    response.setHeader(
        "X-Request-ID",
        requestId,
    );

    next();
}