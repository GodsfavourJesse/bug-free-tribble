import { createHash } from "node:crypto";

import sharp from "sharp";

import {
    and,
    eq,
    isNotNull,
    ne,
} from "drizzle-orm";

import { db } from "../database/index.ts";

import {
    listingImages,
} from "../database/schema/listings/listing-images.ts";

import type {
    ImageAnalysisEvidence,
    ImageAnalysisMatch,
    ImageAnalysisProvider,
} from "./image-analysis-provider.ts";

const PROVIDER = "karmass";

const PROVIDER_VERSION = "1.0.0";

const PIPELINE_VERSION = "1.0.0";

async function calculateDHash(
    buffer: Buffer,
): Promise<string> {
    const { data } = await sharp(buffer)
        .resize(17, 16, {
            fit: "fill",
        })
        .grayscale()
        .raw()
        .toBuffer({
            resolveWithObject: true,
        });

    const bits: string[] = [];

    for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) {
            const currentIndex =
                y * 17 + x;

            const nextIndex =
                currentIndex + 1;

            const current =
                data[currentIndex];

            const next =
                data[nextIndex];

            if (
                current === undefined ||
                next === undefined
            ) {
                throw new Error(
                    "Unable to calculate perceptual hash because the image buffer has an unexpected size.",
                );
            }

            bits.push(
                current < next
                    ? "1"
                    : "0",
            );
        }
    }

    let hexadecimal = "";

    for (
        let index = 0;
        index < bits.length;
        index += 4
    ) {
        const chunk = bits.slice(
            index,
            index + 4,
        );

        hexadecimal += parseInt(
            chunk.join(""),
            2,
        ).toString(16);
    }

    return hexadecimal;
}

function calculateSha256(
    buffer: Buffer,
): string {
    return createHash("sha256")
        .update(buffer)
        .digest("hex");
}

function calculateHammingDistance(
    first: string,
    second: string,
): number {
    if (first.length !== second.length) {
        return Number.MAX_SAFE_INTEGER;
    }

    let distance = 0;

    for (
        let index = 0;
        index < first.length;
        index += 1
    ) {
        const firstValue =
            parseInt(
                first[index] ?? "0",
                16,
            );

        const secondValue =
            parseInt(
                second[index] ?? "0",
                16,
            );

        let xor =
            firstValue ^ secondValue;

        while (xor !== 0) {
            distance += xor & 1;
            xor >>>= 1;
        }
    }

    return distance;
}

function calculateSimilarity(
    first: string,
    second: string,
): number {
    const distance =
        calculateHammingDistance(
            first,
            second,
        );

    if (
        distance ===
        Number.MAX_SAFE_INTEGER
    ) {
        return 0;
    }

    const totalBits =
        first.length * 4;

    if (totalBits === 0) {
        return 0;
    }

    return (
        (1 - distance / totalBits) *
        100
    );
}

async function findBestSimilarityMatch(
    perceptualHash: string,
    currentImageId: string,
): Promise<ImageAnalysisMatch | null> {
    const existingImages =
        await db
            .select({
                id: listingImages.id,
                listingId:
                    listingImages.listingId,
                perceptualHash:
                    listingImages.perceptualHash,
            })
            .from(listingImages)
            .where(
                and(
                    ne(
                        listingImages.id,
                        currentImageId,
                    ),
                    isNotNull(
                        listingImages.perceptualHash,
                    ),
                ),
            );

    let bestMatch:
        ImageAnalysisMatch | null =
        null;

    for (const image of existingImages) {
        if (!image.perceptualHash) {
            continue;
        }

        const similarity =
            calculateSimilarity(
                perceptualHash,
                image.perceptualHash,
            );

        if (
            !bestMatch ||
            similarity >
                bestMatch.similarity
        ) {
            bestMatch = {
                imageId: image.id,
                listingId: image.listingId,
                similarity,
            };
        }
    }

    return bestMatch;
}

export class KarmassBasicImageAnalysisProvider
    implements ImageAnalysisProvider
{
    readonly metadata = {
        provider: PROVIDER,
        providerVersion:
            PROVIDER_VERSION,
        pipelineVersion:
            PIPELINE_VERSION,
    };

    async analyze(
        imageBuffer: Buffer,
        listingImageId: string,
    ): Promise<ImageAnalysisEvidence> {
        const sha256 =
            calculateSha256(
                imageBuffer,
            );

        const perceptualHash =
            await calculateDHash(
                imageBuffer,
            );

        const exactMatches =
            await db
                .select({
                    id: listingImages.id,
                    listingId:
                        listingImages.listingId,
                })
                .from(listingImages)
                .where(
                    and(
                        eq(
                            listingImages.sha256,
                            sha256,
                        ),
                        ne(
                            listingImages.id,
                            listingImageId,
                        ),
                    ),
                )
                .limit(1);

        const exactMatch =
            exactMatches[0];

        const bestSimilarityMatch =
            await findBestSimilarityMatch(
                perceptualHash,
                listingImageId,
            );

        return {
            sha256,
            perceptualHash,

            exactMatch: exactMatch
                ? {
                      imageId:
                          exactMatch.id,
                      listingId:
                          exactMatch.listingId,
                  }
                : null,

            bestSimilarityMatch,
        };
    }
}