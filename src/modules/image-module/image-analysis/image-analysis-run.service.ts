import {
    and,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    imageAnalysisResults,
    imageAnalysisRuns,
} from "../../../database/schema/index.ts";
import { CompleteImageAnalysisRunInput, CreateImageAnalysisResultInput, CreateImageAnalysisRunInput, ImageAnalysisRun } from "./image-analysis.types.ts";


function mapRun(
    run: typeof imageAnalysisRuns.$inferSelect,
): ImageAnalysisRun {
    return {
        id: run.id,
        listingImageId: run.listingImageId,
        jobId: run.jobId,
        status: run.status,
        provider: run.provider,
        providerVersion: run.providerVersion,
        pipelineVersion: run.pipelineVersion,
        modelVersion: run.modelVersion,
        decision: run.decision,
        confidence: run.confidence,
        decisionReason: run.decisionReason,
        errorMessage: run.errorMessage,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        createdAt: run.createdAt,
    };
}

export async function createImageAnalysisRun(
    input: CreateImageAnalysisRunInput,
): Promise<ImageAnalysisRun> {
    const provider = input.provider ?? "karmass";
    const pipelineVersion =
        input.pipelineVersion ?? "1.0.0";

    const insertedRuns = await db
        .insert(imageAnalysisRuns)
        .values({
            listingImageId: input.listingImageId,
            jobId: input.jobId,
            status: "RUNNING",
            provider,
            ...(input.providerVersion
                ? {
                    providerVersion:
                        input.providerVersion,
                }
                : {}),
            pipelineVersion,
            ...(input.modelVersion
                ? {
                    modelVersion:
                        input.modelVersion,
                }
                : {}),
            startedAt: new Date(),
        })
        .returning();

    const insertedRun = insertedRuns[0];

    if (!insertedRun) {
        throw new Error(
            "Failed to create image analysis run.",
        );
    }

    return mapRun(insertedRun);
}

export async function saveImageAnalysisResult(
    input: CreateImageAnalysisResultInput,
): Promise<string> {
    const insertedResults = await db
        .insert(imageAnalysisResults)
        .values({
            runId: input.runId,
            listingImageId: input.listingImageId,
            resultType: input.resultType,
            provider: input.provider,
            ...(input.providerVersion
                ? {
                    providerVersion:
                        input.providerVersion,
                }
                : {}),
            ...(input.modelVersion
                ? {
                    modelVersion:
                        input.modelVersion,
                }
                : {}),
            ...(input.confidence !== undefined
                ? {
                    confidence:
                        input.confidence,
                }
                : {}),
            ...(input.score !== undefined
                ? {
                    score: input.score,
                }
                : {}),
            ...(input.passed !== undefined
                ? {
                    passed: input.passed,
                }
                : {}),
            ...(input.data !== undefined
                ? {
                    data: input.data,
                }
                : {}),
            ...(input.reason
                ? {
                    reason: input.reason,
                }
                : {}),
        })
        .returning({
            id: imageAnalysisResults.id,
        });

    const insertedResult = insertedResults[0];

    if (!insertedResult) {
        throw new Error(
            "Failed to save image analysis result.",
        );
    }

    return insertedResult.id;
}

export async function completeImageAnalysisRun(
    runId: string,
    input: CompleteImageAnalysisRunInput,
): Promise<ImageAnalysisRun> {
    const updatedRuns = await db
        .update(imageAnalysisRuns)
        .set({
            status: "COMPLETED",
            decision: input.decision,
            ...(input.confidence !== undefined
                ? {
                    confidence:
                        input.confidence,
                }
                : {}),
            ...(input.decisionReason
                ? {
                    decisionReason:
                        input.decisionReason,
                }
                : {}),
            completedAt: new Date(),
        })
        .where(
            and(
                eq(
                    imageAnalysisRuns.id,
                    runId,
                ),
                eq(
                    imageAnalysisRuns.status,
                    "RUNNING",
                ),
            ),
        )
        .returning();

    const updatedRun = updatedRuns[0];

    if (!updatedRun) {
        throw new Error(
            "Image analysis run could not be completed because it is no longer running.",
        );
    }

    return mapRun(updatedRun);
}

export async function failImageAnalysisRun(
    runId: string,
    errorMessage: string,
): Promise<ImageAnalysisRun> {
    const normalizedError =
        errorMessage.trim() ||
        "Image analysis run failed.";

    const updatedRuns = await db
        .update(imageAnalysisRuns)
        .set({
            status: "FAILED",
            errorMessage: normalizedError,
            completedAt: new Date(),
        })
        .where(
            and(
                eq(
                    imageAnalysisRuns.id,
                    runId,
                ),
                eq(
                    imageAnalysisRuns.status,
                    "RUNNING",
                ),
            ),
        )
        .returning();

    const updatedRun = updatedRuns[0];

    if (!updatedRun) {
        throw new Error(
            "Image analysis run could not be failed because it is no longer running.",
        );
    }

    return mapRun(updatedRun);
}

export async function cancelImageAnalysisRun(
    runId: string,
): Promise<ImageAnalysisRun> {
    const updatedRuns = await db
        .update(imageAnalysisRuns)
        .set({
            status: "CANCELLED",
            completedAt: new Date(),
        })
        .where(
            and(
                eq(
                    imageAnalysisRuns.id,
                    runId,
                ),
                eq(
                    imageAnalysisRuns.status,
                    "RUNNING",
                ),
            ),
        )
        .returning();

    const updatedRun = updatedRuns[0];

    if (!updatedRun) {
        throw new Error(
            "Image analysis run could not be cancelled because it is no longer running.",
        );
    }

    return mapRun(updatedRun);
}