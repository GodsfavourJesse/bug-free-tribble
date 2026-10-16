import { ImageAnalysisEvidence } from "../../../providers/image-analysis-provider.ts";
import { ImageAnalysisDecision } from "./image-analysis.types.ts";

const FAILED_SIMILARITY_THRESHOLD = 95;

const REVIEW_SIMILARITY_THRESHOLD = 85;

export interface ImageAnalysisDecisionResult {
    decision: ImageAnalysisDecision;
    confidence: number;
    reason: string;
}

export function decideImageAnalysis(
    evidence: ImageAnalysisEvidence,
): ImageAnalysisDecisionResult {
    if (evidence.exactMatch) {
        return {
            decision: "FAILED",
            confidence: 100,
            reason:
                "Exact duplicate image detected.",
        };
    }

    const similarity =
        evidence.bestSimilarityMatch
            ?.similarity;

    if (
        similarity !== undefined &&
        similarity >=
            FAILED_SIMILARITY_THRESHOLD
    ) {
        return {
            decision: "FAILED",
            confidence: similarity,
            reason:
                "Image is highly similar to an existing marketplace image.",
        };
    }

    if (
        similarity !== undefined &&
        similarity >=
            REVIEW_SIMILARITY_THRESHOLD
    ) {
        return {
            decision: "REVIEW",
            confidence: similarity,
            reason:
                "Image is similar to an existing marketplace image and requires manual review.",
        };
    }

    return {
        decision: "PASSED",
        confidence:
            similarity === undefined
                ? 100
                : Math.max(
                      0,
                      100 - similarity,
                  ),
        reason:
            "Image passed duplicate-image analysis.",
    };
}