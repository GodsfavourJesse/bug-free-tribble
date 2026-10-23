import { getImageAnalysisProvider } from "../../../providers/image-analysis-provider.registr.ts";
import { decideImageAnalysis } from "../image-analysis/image-analysis-decision.service.ts";
import {
    saveImageAnalysisResult,
    saveImageAnalysisResultsForWorker,
} from "../image-analysis/image-analysis-run.service.ts";
import {
    CreateImageAnalysisResultInput,
    ImageAnalysisDecision,
    ImageAnalysisOutput,
} from "../image-analysis/image-analysis.types.ts";

const provider = getImageAnalysisProvider("karmass");

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

interface ImageAnalysisWorkerContext {
    jobId: string;
    workerId: string;
}

type PendingImageAnalysisResult = CreateImageAnalysisResultInput;

/*
 * ============================================================
 * RESULT BUILDERS
 * ============================================================
 */

function buildSha256Result(
    runId: string,
    listingImageId: string,
    sha256: string,
): PendingImageAnalysisResult {
    return {
        runId,
        listingImageId,
        resultType: "SHA256",
        provider: provider.metadata.provider,
        providerVersion: provider.metadata.providerVersion,
        modelVersion: provider.metadata.pipelineVersion,
        data: { sha256 },
        passed: true,
    };
}

function buildPerceptualHashResult(
    runId: string,
    listingImageId: string,
    perceptualHash: string,
    similarityScore: number | null,
    matchedImageId: string | null,
    matchedListingId: string | null,
): PendingImageAnalysisResult {
    return {
        runId,
        listingImageId,
        resultType: "PERCEPTUAL_HASH",
        provider: provider.metadata.provider,
        providerVersion: provider.metadata.providerVersion,
        modelVersion: provider.metadata.pipelineVersion,
        score: similarityScore !== null ? similarityScore.toFixed(4) : "0",
        passed: similarityScore === null || similarityScore < 85,
        data: {
            perceptualHash,
            matchedImageId,
            matchedListingId,
            similarity: similarityScore,
        },
    };
}

function buildDuplicateResult(
    runId: string,
    listingImageId: string,
    similarity: number,
    matchedImageId: string,
    matchedListingId: string,
    decision: ImageAnalysisDecision,
): PendingImageAnalysisResult {
    return {
        runId,
        listingImageId,
        resultType: "DUPLICATE",
        provider: provider.metadata.provider,
        providerVersion: provider.metadata.providerVersion,
        modelVersion: provider.metadata.pipelineVersion,
        score: similarity.toFixed(4),
        passed: decision === "PASSED",
        data: {
            matchedImageId,
            matchedListingId,
            similarity,
        },
        reason:
            decision === "FAILED"
                ? "Image is highly similar to an existing marketplace image."
                : "Image requires manual review because it is similar to an existing marketplace image.",
    };
}

/*
 * ============================================================
 * RESULT PERSISTENCE
 * ============================================================
 */

async function persistAnalysisResults(
    results: PendingImageAnalysisResult[],
    workerContext?: ImageAnalysisWorkerContext,
): Promise<void> {
    if (results.length === 0) {
        return;
    }

    if (workerContext) {
        await saveImageAnalysisResultsForWorker(
            results.map((result) => ({
                ...result,
                ...workerContext,
            })),
        );

        return;
    }

    // Non-worker callers retain the existing persistence behavior.
    for (const result of results) {
        await saveImageAnalysisResult(result);
    }
}

/*
 * ============================================================
 * IMAGE ANALYSIS
 * ============================================================
 */

export async function analyzeImage(
    imageBuffer: Buffer,
    _listingId: string,
    imageId: string,
    runId?: string,
    workerContext?: ImageAnalysisWorkerContext,
): Promise<ImageAnalysisOutput> {
    if (runId && !workerContext) {
        throw new Error(
            "Worker context is required when persisting image analysis results.",
        );
    }

    const evidence = await provider.analyze(imageBuffer, imageId);

    const decision = decideImageAnalysis(evidence);

    if (runId) {
        const results: PendingImageAnalysisResult[] = [
            buildSha256Result(runId, imageId, evidence.sha256),

            buildPerceptualHashResult(
                runId,
                imageId,
                evidence.perceptualHash,
                evidence.bestSimilarityMatch?.similarity ?? null,
                evidence.bestSimilarityMatch?.imageId ?? null,
                evidence.bestSimilarityMatch?.listingId ?? null,
            ),
        ];

        if (evidence.exactMatch) {
            results.push(
                buildDuplicateResult(
                    runId,
                    imageId,
                    100,
                    evidence.exactMatch.imageId,
                    evidence.exactMatch.listingId,
                    "FAILED",
                ),
            );
        } else if (
            evidence.bestSimilarityMatch &&
            evidence.bestSimilarityMatch.similarity >= 85
        ) {
            results.push(
                buildDuplicateResult(
                    runId,
                    imageId,
                    evidence.bestSimilarityMatch.similarity,
                    evidence.bestSimilarityMatch.imageId,
                    evidence.bestSimilarityMatch.listingId,
                    decision.decision,
                ),
            );
        }

        await persistAnalysisResults(results, workerContext);
    }

    return {
        decision: decision.decision,
        confidence: decision.confidence.toFixed(2),
        reason: decision.reason,
        sha256: evidence.sha256,
        perceptualHash: evidence.perceptualHash,
        similarityScore: evidence.bestSimilarityMatch
            ? evidence.bestSimilarityMatch.similarity.toFixed(2)
            : null,
        matchedImageId:
            evidence.exactMatch?.imageId ??
            evidence.bestSimilarityMatch?.imageId ??
            null,
        matchedListingId:
            evidence.exactMatch?.listingId ??
            evidence.bestSimilarityMatch?.listingId ??
            null,
    };
}