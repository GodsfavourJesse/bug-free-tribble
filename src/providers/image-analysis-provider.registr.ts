import type {
    ImageAnalysisProvider,
} from "./image-analysis-provider.ts";

import {
    KarmassBasicImageAnalysisProvider,
} from "./karmass-basic.provider.ts";

const karmassBasicProvider =
    new KarmassBasicImageAnalysisProvider();

const providers: Record<
    string,
    ImageAnalysisProvider
> = {
    karmass:
        karmassBasicProvider,
};

export function getImageAnalysisProvider(
    providerName = "karmass",
): ImageAnalysisProvider {
    const provider =
        providers[providerName];

    if (!provider) {
        throw new Error(
            `Image analysis provider "${providerName}" is not configured.`,
        );
    }

    return provider;
}