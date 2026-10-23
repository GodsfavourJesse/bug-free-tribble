export type ImageAnalysisJobStatus =
    | "QUEUED"
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED";

export interface EnqueueImageAnalysisJobInput {
    listingImageId: string;
    priority?: number;
    maxAttempts?: number;

    /**
     * Allows an administrator to retry an eligible technical
     * failure. Human review decisions must still be respected.
     */
    retryTechnicalFailure?: boolean;
}

export interface ImageAnalysisJob {
    id: string;
    listingImageId: string;
    status: ImageAnalysisJobStatus;
    priority: number;
    attempts: number;
    maxAttempts: number;
    availableAt: Date;
    lockedAt: Date | null;
    lockedBy: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface ClaimedImageAnalysisJob extends ImageAnalysisJob {
    workerId: string;
}