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
    listingImages,
} from "../../../database/schema/index.ts";

export type ImageAnalysisState =
    | "PENDING"
    | "QUEUED"
    | "PROCESSING"
    | "PASSED"
    | "REVIEW"
    | "FAILED"
    | "CANCELLED";

export interface ImageAnalysisStatus {
    analysisState: ImageAnalysisState;

    failureReason: string | null;

    image: {
        id: string;
        imageCheckStatus:
            | "PENDING"
            | "PASSED"
            | "REVIEW"
            | "FAILED";
        checkReason: string | null;
        checkedAt: Date | null;
    } | null;

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
    const imageRows = await db
        .select({
            id: listingImages.id,
            imageCheckStatus:
                listingImages.imageCheckStatus,
            checkReason: listingImages.checkReason,
            checkedAt: listingImages.checkedAt,
        })
        .from(listingImages)
        .where(
            eq(
                listingImages.id,
                listingImageId,
            ),
        )
        .limit(1);

    const image = imageRows[0] ?? null;

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

    const results = run
        ? await db
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
              )
        : [];

    /*
     * Build a consistent public analysis state.
     *
     * The persisted listing image decision takes precedence
     * because it is the authoritative result used elsewhere
     * in the listing system.
     */
    let analysisState: ImageAnalysisState = "PENDING";

    let failureReason: string | null = null;

    if (!image) {
        analysisState = "FAILED";

        failureReason =
            "This image could not be found. Please upload it again.";
    } else if (
        image.imageCheckStatus === "PASSED"
    ) {
        analysisState = "PASSED";
    } else if (
        image.imageCheckStatus === "REVIEW"
    ) {
        analysisState = "REVIEW";
    } else if (
        image.imageCheckStatus === "FAILED"
    ) {
        analysisState = "FAILED";

        failureReason =
            image.checkReason ??
            "The image checks could not be completed. Please try again.";
    } else if (
        job?.status === "FAILED"
    ) {
        analysisState = "FAILED";

        failureReason =
            "The image checks could not be completed after several attempts. Please try again.";
    } else if (
        job?.status === "CANCELLED" ||
        run?.status === "CANCELLED"
    ) {
        analysisState = "CANCELLED";
    } else if (
        job?.status === "PROCESSING" ||
        run?.status === "RUNNING"
    ) {
        analysisState = "PROCESSING";
    } else if (
        job?.status === "QUEUED"
    ) {
        analysisState = "QUEUED";
    } else if (
        !job
    ) {
        /*
         * This can occur with older image records created
         * before automatic job creation was introduced.
         */
        analysisState = "FAILED";

        failureReason =
            "Image analysis has not been scheduled. Please retry the image checks.";
    } else if (
        job.status === "COMPLETED" &&
        !run
    ) {
        analysisState = "FAILED";

        failureReason =
            "The analysis job finished without producing an analysis result. Please retry.";
    } else if (
        job.status === "COMPLETED" &&
        run?.status === "COMPLETED" &&
        !run.decision
    ) {
        analysisState = "FAILED";

        failureReason =
            "The analysis finished without producing a decision. Please retry.";
    } else if (
        job.status === "COMPLETED" &&
        run?.decision === "PASSED"
    ) {
        analysisState = "PASSED";
    } else if (
        job.status === "COMPLETED" &&
        run?.decision === "REVIEW"
    ) {
        analysisState = "REVIEW";
    } else if (
        job.status === "COMPLETED" &&
        run?.decision === "FAILED"
    ) {
        analysisState = "FAILED";

        failureReason =
            image.checkReason ??
            run.decisionReason ??
            "The image did not pass its checks.";
    }

    /*
     * Return the image's persisted state and the most recent
     * job, run, and result records.
     */
    return {
        analysisState,
        failureReason,

        image: image
            ? {
                  id: image.id,
                  imageCheckStatus:
                      image.imageCheckStatus,
                  checkReason:
                      image.checkReason,
                  checkedAt:
                      image.checkedAt,
              }
            : null,

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

        run: run
            ? {
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
                  decision: run.decision,
                  confidence: run.confidence,
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
              }
            : null,

        results: results.map(
            (result) => ({
                id: result.id,
                resultType:
                    result.resultType,
                provider: result.provider,
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