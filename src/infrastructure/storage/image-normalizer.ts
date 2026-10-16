import sharp from "sharp";

import { env } from "../../config/env.ts";

export interface NormalizedImage {
    buffer: Buffer;
    width: number;
    height: number;
    format: "webp";
}

export interface ThumbnailImage {
    buffer: Buffer;
    width: number;
    height: number;
    format: "webp";
}

export async function normalizeImage(
    input: Buffer,
): Promise<NormalizedImage> {
    const {
        data,
        info,
    } = await sharp(input, {
        failOn: "error",
    })
        .rotate()
        .resize({
            width: env.MAX_IMAGE_WIDTH,
            height: env.MAX_IMAGE_HEIGHT,
            fit: "inside",
            withoutEnlargement: true,
        })
        .webp({
            quality: 88,
            effort: 4,
        })
        .toBuffer({
            resolveWithObject: true,
        });

    return {
        buffer: data,
        width: info.width,
        height: info.height,
        format: "webp",
    };
}

export async function createThumbnail(
    input: Buffer,
): Promise<ThumbnailImage> {
    const {
        data,
        info,
    } = await sharp(input, {
        failOn: "error",
    })
        .rotate()
        .resize({
            width: env.IMAGE_THUMBNAIL_WIDTH,
            height: env.IMAGE_THUMBNAIL_HEIGHT,
            fit: "inside",
            withoutEnlargement: true,
        })
        .webp({
            quality: 78,
            effort: 4,
        })
        .toBuffer({
            resolveWithObject: true,
        });

    return {
        buffer: data,
        width: info.width,
        height: info.height,
        format: "webp",
    };
}