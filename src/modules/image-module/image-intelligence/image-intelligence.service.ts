import { getImageAnalysisProvider } from "../../../providers/image-analysis-provider.registr.ts";
import { decideImageAnalysis } from "../image-analysis/image-analysis-decision.service.ts";
import {
    saveImageAnalysisResult,
} from "../image-analysis/image-analysis-run.service.ts";
import { ImageAnalysisDecision, ImageAnalysisOutput } from "../image-analysis/image-analysis.types.ts";


const provider = getImageAnalysisProvider("karmass");

async function saveSha256Result(
    runId: string,
    listingImageId: string,
    sha256: string,
): Promise<void> {
    await saveImageAnalysisResult({
        runId,
        listingImageId,
        resultType: "SHA256",
        provider:
            provider.metadata.provider,
        providerVersion:
            provider.metadata.providerVersion,
        modelVersion:
            provider.metadata.pipelineVersion,
        data: {
            sha256,
        },
        passed: true,
    });
}

async function savePerceptualHashResult(
    runId: string,
    listingImageId: string,
    perceptualHash: string,
    similarityScore: number | null,
    matchedImageId: string | null,
    matchedListingId: string | null,
): Promise<void> {
    await saveImageAnalysisResult({
        runId,
        listingImageId,
        resultType: "PERCEPTUAL_HASH",
        provider:
            provider.metadata.provider,
        providerVersion:
            provider.metadata.providerVersion,
        modelVersion:
            provider.metadata.pipelineVersion,
        score:
            similarityScore !== null
                ? similarityScore.toFixed(4)
                : "0",
        passed:
            similarityScore === null ||
            similarityScore < 85,
        data: {
            perceptualHash,
            matchedImageId,
            matchedListingId,
            similarity:
                similarityScore,
        },
    });
}

async function saveDuplicateResult(
    runId: string,
    listingImageId: string,
    similarity: number,
    matchedImageId: string,
    matchedListingId: string,
    decision: ImageAnalysisDecision,
): Promise<void> {
    await saveImageAnalysisResult({
        runId,
        listingImageId,
        resultType: "DUPLICATE",
        provider:
            provider.metadata.provider,
        providerVersion:
            provider.metadata.providerVersion,
        modelVersion:
            provider.metadata.pipelineVersion,
        score:
            similarity.toFixed(4),
        passed:
            decision === "PASSED",
        data: {
            matchedImageId,
            matchedListingId,
            similarity,
        },
        reason:
            decision === "FAILED"
                ? "Image is highly similar to an existing marketplace image."
                : "Image requires manual review because it is similar to an existing marketplace image.",
    });
}

export async function analyzeImage(
    imageBuffer: Buffer,
    _listingId: string,
    imageId: string,
    runId?: string,
): Promise<ImageAnalysisOutput> {
    const evidence =
        await provider.analyze(
            imageBuffer,
            imageId,
        );

    const decision =
        decideImageAnalysis(
            evidence,
        );

    if (runId) {
        await saveSha256Result(
            runId,
            imageId,
            evidence.sha256,
        );

        await savePerceptualHashResult(
            runId,
            imageId,
            evidence.perceptualHash,
            evidence.bestSimilarityMatch
                ?.similarity ?? null,
            evidence.bestSimilarityMatch
                ?.imageId ?? null,
            evidence.bestSimilarityMatch
                ?.listingId ?? null,
        );

        if (
            evidence.exactMatch
        ) {
            await saveDuplicateResult(
                runId,
                imageId,
                100,
                evidence.exactMatch
                    .imageId,
                evidence.exactMatch
                    .listingId,
                "FAILED",
            );
        } else if (
            evidence.bestSimilarityMatch &&
            evidence.bestSimilarityMatch
                .similarity >= 85
        ) {
            await saveDuplicateResult(
                runId,
                imageId,
                evidence.bestSimilarityMatch
                    .similarity,
                evidence.bestSimilarityMatch
                    .imageId,
                evidence.bestSimilarityMatch
                    .listingId,
                decision.decision,
            );
        }
    }

    return {
        decision:
            decision.decision,

        confidence:
            decision.confidence.toFixed(2),

        reason:
            decision.reason,

        sha256:
            evidence.sha256,

        perceptualHash:
            evidence.perceptualHash,

        similarityScore:
            evidence.bestSimilarityMatch
                ? evidence.bestSimilarityMatch
                      .similarity
                      .toFixed(2)
                : null,

        matchedImageId:
            evidence.exactMatch
                ?.imageId ??
            evidence.bestSimilarityMatch
                ?.imageId ??
            null,

        matchedListingId:
            evidence.exactMatch
                ?.listingId ??
            evidence.bestSimilarityMatch
                ?.listingId ??
            null,
    };
}