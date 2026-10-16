import sharp from "sharp";

import { env } from "../../config/env.ts";

export interface ValidatedImage {
    width: number;
    height: number;
    format: string;
    sizeBytes: number;
}

const ALLOWED_IMAGE_FORMATS = new Set([
    "jpeg",
    "png",
    "webp",
    "avif",
]);

export async function validateImage(
    buffer: Buffer,
): Promise<ValidatedImage> {
    if (buffer.length === 0) {
        throw new Error(
            "Image file is empty.",
        );
    }

    const maxBytes =
        env.MAX_IMAGE_SIZE_MB *
        1024 *
        1024;

    if (buffer.length > maxBytes) {
        throw new Error(
            `Image exceeds the maximum size of ${env.MAX_IMAGE_SIZE_MB} MB.`,
        );
    }

    let metadata: Awaited<
        ReturnType<
            ReturnType<typeof sharp>["metadata"]
        >
    >;

    try {
        metadata =
            await sharp(buffer).metadata();
    } catch {
        throw new Error(
            "Unable to read image metadata. The uploaded file may be invalid or corrupted.",
        );
    }

    if (
        !metadata.format ||
        !ALLOWED_IMAGE_FORMATS.has(
            metadata.format,
        )
    ) {
        throw new Error(
            "Unsupported image format. Allowed formats are JPEG, PNG, WebP and AVIF.",
        );
    }

    if (
        !metadata.width ||
        !metadata.height
    ) {
        throw new Error(
            "Image dimensions could not be determined.",
        );
    }

    if (
        metadata.width <
            env.IMAGE_MIN_WIDTH ||
        metadata.height <
            env.IMAGE_MIN_HEIGHT
    ) {
        throw new Error(
            `Image dimensions are too small. Minimum dimensions are ${env.IMAGE_MIN_WIDTH}x${env.IMAGE_MIN_HEIGHT} pixels.`,
        );
    }

    if (
        metadata.width >
            env.MAX_IMAGE_WIDTH ||
        metadata.height >
            env.MAX_IMAGE_HEIGHT
    ) {
        throw new Error(
            `Image dimensions are too large. Maximum dimensions are ${env.MAX_IMAGE_WIDTH}x${env.MAX_IMAGE_HEIGHT} pixels.`,
        );
    }

    return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        sizeBytes: buffer.length,
    };
}