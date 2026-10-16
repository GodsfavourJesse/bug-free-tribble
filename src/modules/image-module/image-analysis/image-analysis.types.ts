export type ImageAnalysisRunStatus =
    | "RUNNING"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED";

export type ImageAnalysisResultType =
    | "SHA256"
    | "PERCEPTUAL_HASH"
    | "EMBEDDING"
    | "OCR"
    | "MODERATION"
    | "WATERMARK"
    | "DUPLICATE";

export type ImageAnalysisDecision =
    | "PASSED"
    | "REVIEW"
    | "FAILED";

export interface CreateImageAnalysisRunInput {
    listingImageId: string;
    jobId: string;
    provider?: string;
    providerVersion?: string;
    pipelineVersion?: string;
    modelVersion?: string;
}

export interface CreateImageAnalysisResultInput {
    runId: string;
    listingImageId: string;
    resultType: ImageAnalysisResultType;
    provider: string;
    providerVersion?: string;
    modelVersion?: string;
    confidence?: string;
    score?: string;
    passed?: boolean;
    data?: unknown;
    reason?: string;
}

export interface CompleteImageAnalysisRunInput {
    decision: ImageAnalysisDecision;
    confidence?: string;
    decisionReason?: string;
}

export interface ImageAnalysisRun {
    id: string;
    listingImageId: string;
    jobId: string | null;
    status: ImageAnalysisRunStatus;
    provider: string;
    providerVersion: string | null;
    pipelineVersion: string;
    modelVersion: string | null;
    decision: ImageAnalysisDecision | null;
    confidence: string | null;
    decisionReason: string | null;
    errorMessage: string | null;
    startedAt: Date;
    completedAt: Date | null;
    createdAt: Date;
}

export interface ImageAnalysisOutput {
    decision: ImageAnalysisDecision;
    confidence: string;
    reason: string;
    sha256: string;
    perceptualHash: string;
    similarityScore: string | null;
    matchedImageId: string | null;
    matchedListingId: string | null;
}