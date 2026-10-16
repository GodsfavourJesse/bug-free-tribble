import multer from "multer";

import { env } from "../config/env.ts";

import {
    AppError,
} from "../errors/app-error.ts";

const ALLOWED_IMAGE_TYPES =
    new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
    ]);

export const imageUpload =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                env.MAX_IMAGE_SIZE_MB *
                1024 *
                1024,
        },

        fileFilter: (
            _request,
            file,
            callback,
        ) => {
            if (
                !ALLOWED_IMAGE_TYPES.has(
                    file.mimetype,
                )
            ) {
                callback(
                    new AppError(
                        "Only JPEG, PNG, and WebP images are allowed.",
                        415,
                        "UNSUPPORTED_MEDIA_TYPE",
                    ),
                );

                return;
            }

            callback(
                null,
                true,
            );
        },
    });