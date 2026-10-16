import type {
    NextFunction,
    Request,
    Response,
} from "express";

import {
    AdminSecurityChallengeError,
    getAdminSecurityChallenge,
    startAdminSecurityChallenge,
    submitAdminSecurityChallengeAnswer,
} from "./admin-security-challenge.service.ts";

import type {
    AdminChallengeMetadata,
} from "./admin-security-challenge.service.ts";

function getChallengeMetadata(
    request: Request,
): AdminChallengeMetadata {
    const metadata: AdminChallengeMetadata = {};

    const userAgent = request.get("user-agent");

    if (userAgent) {
        metadata.userAgent = userAgent.slice(0, 500);
    }

    if (request.ip) {
        metadata.ipAddress = request.ip.slice(0, 64);
    }

    return metadata;
}

function handleChallengeError(
    error: unknown,
    response: Response,
    next: NextFunction,
): void {
    if (error instanceof AdminSecurityChallengeError) {
        response.status(error.statusCode).json({
            success: false,
            error: {
                code: error.code,
                message: error.message,
            },
        });

        return;
    }

    next(error);
}

/**
 * POST /admin/auth/security-challenge/start
 *
 * Starts a new administrator security-awareness challenge.
 */
export async function startAdminSecurityChallengeController(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const result = await startAdminSecurityChallenge(
            getChallengeMetadata(request),
        );

        response
            .setHeader("Cache-Control", "no-store")
            .setHeader("Pragma", "no-cache")
            .status(201)
            .json({
                success: true,
                message: "Security challenge started.",
                data: result,
            });
    } catch (error) {
        handleChallengeError(error, response, next);
    }
}

/**
 * POST /admin/auth/security-challenge/current
 *
 * Returns the current question without exposing its answer.
 */
export async function getAdminSecurityChallengeController(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const body = request.body as {
            challengeToken: string;
        };

        const result = await getAdminSecurityChallenge(
            body.challengeToken,
        );

        response
            .setHeader("Cache-Control", "no-store")
            .setHeader("Pragma", "no-cache")
            .status(200)
            .json({
                success: true,
                data: result,
            });
    } catch (error) {
        handleChallengeError(error, response, next);
    }
}

/**
 * POST /admin/auth/security-challenge/answer
 *
 * Submits an answer for the current stage.
 */
export async function submitAdminSecurityChallengeAnswerController(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const body = request.body as {
            challengeToken: string;
            answer: string;
        };

        const result =
            await submitAdminSecurityChallengeAnswer(
                {
                    challengeToken: body.challengeToken,
                    answer: body.answer,
                },
                getChallengeMetadata(request),
            );

        response
            .setHeader("Cache-Control", "no-store")
            .setHeader("Pragma", "no-cache")
            .status(200)
            .json({
                success: true,
                message: result.completed
                    ? "Security challenge completed."
                    : "Answer accepted.",
                data: result,
            });
    } catch (error) {
        handleChallengeError(error, response, next);
    }
}