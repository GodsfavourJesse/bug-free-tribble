export interface ImageAnalysisMatch {
    imageId: string;
    listingId: string;
    similarity: number;
}

export interface ImageAnalysisEvidence {
    sha256: string;
    perceptualHash: string;

    exactMatch: {
        imageId: string;
        listingId: string;
    } | null;

    bestSimilarityMatch: ImageAnalysisMatch | null;
}

export interface ImageAnalysisProviderMetadata {
    provider: string;
    providerVersion: string;
    pipelineVersion: string;
}

export interface ImageAnalysisProvider {
    readonly metadata: ImageAnalysisProviderMetadata;

    analyze(
        imageBuffer: Buffer,
        listingImageId: string,
    ): Promise<ImageAnalysisEvidence>;
}