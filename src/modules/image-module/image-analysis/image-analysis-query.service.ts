import {
    and,
    desc,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    imageAnalysisJobs,
    imageAnalysisResults,
    imageAnalysisRuns,
} from "../../../database/schema/index.ts";

export interface ImageAnalysisStatus {
    job: {
        id: string;
        status:
            | "QUEUED"
            | "PROCESSING"
            | "COMPLETED"
            | "FAILED"
            | "CANCELLED";
        priority: number;
        attempts: number;
        maxAttempts: number;
        availableAt: Date;
        lockedAt: Date | null;
        startedAt: Date | null;
        completedAt: Date | null;
        failedAt: Date | null;
        lastError: string | null;
        createdAt: Date;
        updatedAt: Date;
    } | null;

    run: {
        id: string;
        jobId: string | null;
        status:
            | "RUNNING"
            | "COMPLETED"
            | "FAILED"
            | "CANCELLED";
        provider: string;
        providerVersion: string | null;
        pipelineVersion: string;
        modelVersion: string | null;
        decision:
            | "PASSED"
            | "REVIEW"
            | "FAILED"
            | null;
        confidence: string | null;
        decisionReason: string | null;
        errorMessage: string | null;
        startedAt: Date;
        completedAt: Date | null;
        createdAt: Date;
    } | null;

    results: Array<{
        id: string;
        resultType:
            | "SHA256"
            | "PERCEPTUAL_HASH"
            | "EMBEDDING"
            | "OCR"
            | "MODERATION"
            | "WATERMARK"
            | "DUPLICATE";
        provider: string;
        providerVersion: string | null;
        modelVersion: string | null;
        confidence: string | null;
        score: string | null;
        passed: boolean | null;
        data: unknown;
        reason: string | null;
        createdAt: Date;
    }>;
}

export async function getImageAnalysisStatus(
    listingImageId: string,
): Promise<ImageAnalysisStatus> {
    const jobs = await db
        .select()
        .from(imageAnalysisJobs)
        .where(
            eq(
                imageAnalysisJobs.listingImageId,
                listingImageId,
            ),
        )
        .orderBy(
            desc(imageAnalysisJobs.createdAt),
        )
        .limit(1);

    const job = jobs[0] ?? null;

    const runs = await db
        .select()
        .from(imageAnalysisRuns)
        .where(
            eq(
                imageAnalysisRuns.listingImageId,
                listingImageId,
            ),
        )
        .orderBy(
            desc(imageAnalysisRuns.createdAt),
        )
        .limit(1);

    const run = runs[0] ?? null;

    if (!run) {
        return {
            job: job
                ? {
                      id: job.id,
                      status: job.status,
                      priority: job.priority,
                      attempts: job.attempts,
                      maxAttempts:
                          job.maxAttempts,
                      availableAt:
                          job.availableAt,
                      lockedAt:
                          job.lockedAt,
                      startedAt:
                          job.startedAt,
                      completedAt:
                          job.completedAt,
                      failedAt:
                          job.failedAt,
                      lastError:
                          job.lastError,
                      createdAt:
                          job.createdAt,
                      updatedAt:
                          job.updatedAt,
                  }
                : null,
            run: null,
            results: [],
        };
    }

    const results =
        await db
            .select()
            .from(imageAnalysisResults)
            .where(
                eq(
                    imageAnalysisResults.runId,
                    run.id,
                ),
            )
            .orderBy(
                desc(
                    imageAnalysisResults.createdAt,
                ),
            );

    return {
        job: job
            ? {
                  id: job.id,
                  status: job.status,
                  priority: job.priority,
                  attempts: job.attempts,
                  maxAttempts:
                      job.maxAttempts,
                  availableAt:
                      job.availableAt,
                  lockedAt:
                      job.lockedAt,
                  startedAt:
                      job.startedAt,
                  completedAt:
                      job.completedAt,
                  failedAt:
                      job.failedAt,
                  lastError:
                      job.lastError,
                  createdAt:
                      job.createdAt,
                  updatedAt:
                      job.updatedAt,
              }
            : null,

        run: {
            id: run.id,
            jobId: run.jobId,
            status: run.status,
            provider: run.provider,
            providerVersion:
                run.providerVersion,
            pipelineVersion:
                run.pipelineVersion,
            modelVersion:
                run.modelVersion,
            decision:
                run.decision,
            confidence:
                run.confidence,
            decisionReason:
                run.decisionReason,
            errorMessage:
                run.errorMessage,
            startedAt:
                run.startedAt,
            completedAt:
                run.completedAt,
            createdAt:
                run.createdAt,
        },

        results: results.map(
            (result) => ({
                id: result.id,
                resultType:
                    result.resultType,
                provider:
                    result.provider,
                providerVersion:
                    result.providerVersion,
                modelVersion:
                    result.modelVersion,
                confidence:
                    result.confidence,
                score:
                    result.score,
                passed:
                    result.passed,
                data: result.data,
                reason:
                    result.reason,
                createdAt:
                    result.createdAt,
            }),
        ),
    };
}