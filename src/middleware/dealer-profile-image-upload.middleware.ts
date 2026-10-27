import multer from "multer";

const PROFILE_PICTURE_MAX_SIZE = 5 * 1024 * 1024;
const COVER_PHOTO_MAX_SIZE = 8 * 1024 * 1024;

const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

export const dealerProfilePictureUpload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: PROFILE_PICTURE_MAX_SIZE,
        files: 1,
    },

    fileFilter: (_request, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            callback(
                new Error(
                    "Only JPEG, PNG, and WebP images are allowed.",
                ),
            );

            return;
        }

        callback(null, true);
    },
});

export const dealerCoverPhotoUpload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: COVER_PHOTO_MAX_SIZE,
        files: 1,
    },

    fileFilter: (_request, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            callback(
                new Error(
                    "Only JPEG, PNG, and WebP images are allowed.",
                ),
            );

            return;
        }

        callback(null, true);
    },
});