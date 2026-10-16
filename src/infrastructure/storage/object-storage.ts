import crypto from "node:crypto";
import path from "node:path";

import { v2 as cloudinary } from "cloudinary";

import { env } from "../../config/env.ts";

import type {
    ImageTransformationOptions,
    ObjectStorage,
    ObjectStorageItem,
    ObjectStorageListOptions,
    ObjectStoragePutOptions,
    ObjectStorageUrlOptions,
    StorageAccess,
    StorageResourceType,
} from "./storage.types.ts";

cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
});

function resolveResourceType(
    contentType: string,
    requested?: StorageResourceType,
): StorageResourceType {
    if (requested) {
        return requested;
    }

    if (contentType.startsWith("image/")) {
        return "image";
    }

    if (contentType.startsWith("video/")) {
        return "video";
    }

    return "raw";
}

function resolveCloudinaryType(
    access: StorageAccess,
): "upload" | "private" {
    return access === "private"
        ? "private"
        : "upload";
}

function buildCloudinaryUrl(
    key: string,
    resourceType: StorageResourceType,
    access: StorageAccess,
): string {
    return cloudinary.url(
        key,
        {
            secure: true,
            resource_type: resourceType,
            type: resolveCloudinaryType(
                access,
            ),
        },
    );
}

function buildImageTransformation(
    options: ImageTransformationOptions,
): Record<string, string | number> {
    const transformation:
        Record<string, string | number> = {};

    if (options.width !== undefined) {
        transformation.width =
            options.width;
    }

    if (options.height !== undefined) {
        transformation.height =
            options.height;
    }

    if (options.fit !== undefined) {
        transformation.crop =
            options.fit;
    }

    if (options.quality !== undefined) {
        transformation.quality =
            options.quality;
    }

    if (options.format !== undefined) {
        transformation.fetch_format =
            options.format;
    }

    return transformation;
}

interface CloudinaryUploadResult {
    public_id: string;
    secure_url: string;
}

interface CloudinaryResourceResult {
    public_id: string;
    resource_type: string;
    type: string;
    created_at?: string;
}

function splitCloudinaryKey(
    key: string,
): {
    publicId: string;
    format: string;
} {
    const normalizedKey =
        key.replace(/^\/+/, "");

    const extension =
        path.extname(
            normalizedKey,
        );

    if (!extension) {
        throw new Error(
            "A file extension is required for this Cloudinary asset.",
        );
    }

    const publicId =
        normalizedKey.slice(
            0,
            -extension.length,
        );

    if (!publicId) {
        throw new Error(
            "A valid Cloudinary public ID is required.",
        );
    }

    return {
        publicId,
        format: extension
            .slice(1)
            .toLowerCase(),
    };
}

function normalizeResourceType(
    resourceType: string,
): StorageResourceType {
    if (
        resourceType === "image" ||
        resourceType === "raw" ||
        resourceType === "video" ||
        resourceType === "auto"
    ) {
        return resourceType;
    }

    return "raw";
}

function normalizeAccessType(
    type: string,
): StorageAccess {
    return type === "private"
        ? "private"
        : "public";
}

function parseCreatedAt(
    value: string | undefined,
): Date | undefined {
    if (!value) {
        return undefined;
    }

    const parsed =
        new Date(value);

    if (
        Number.isNaN(
            parsed.getTime(),
        )
    ) {
        return undefined;
    }

    return parsed;
}

class CloudinaryObjectStorage
    implements ObjectStorage
{
    async put(
        key: string,
        body: Buffer,
        contentType: string,
        options: ObjectStoragePutOptions = {},
    ): Promise<{
        key: string;
        url: string;
        resourceType: StorageResourceType;
    }> {
        const resourceType =
            resolveResourceType(
                contentType,
                options.resourceType,
            );

        const access =
            options.access ?? "public";

        const uploadType =
            resolveCloudinaryType(
                access,
            );

        const uploadOptions = {
            public_id: key,
            resource_type:
                resourceType,
            type: uploadType,
            overwrite: false,
            invalidate: true,
            ...(options.folder !==
            undefined
                ? {
                      folder:
                          options.folder,
                  }
                : {}),
            ...(options.format !==
            undefined
                ? {
                      format:
                          options.format,
                  }
                : {}),
        };

        const result =
            await new Promise<CloudinaryUploadResult>(
                (
                    resolve,
                    reject,
                ) => {
                    const stream =
                        cloudinary
                            .uploader
                            .upload_stream(
                                uploadOptions,
                                (
                                    error,
                                    uploadResult,
                                ) => {
                                    if (
                                        error
                                    ) {
                                        reject(
                                            error,
                                        );
                                        return;
                                    }

                                    if (
                                        !uploadResult
                                    ) {
                                        reject(
                                            new Error(
                                                "Cloudinary upload returned no result.",
                                            ),
                                        );
                                        return;
                                    }

                                    resolve(
                                        {
                                            public_id:
                                                uploadResult.public_id,

                                            secure_url:
                                                uploadResult.secure_url,
                                        },
                                    );
                                },
                            );

                    stream.on(
                        "error",
                        reject,
                    );

                    stream.end(
                        body,
                    );
                },
            );

        return {
            key:
                result.public_id,

            url:
                result.secure_url,

            resourceType,
        };
    }

    async get(
        key: string,
        options: {
            resourceType?: StorageResourceType;
            access?: StorageAccess;
        } = {},
    ): Promise<Buffer> {
        const resourceType =
            options.resourceType ??
            "image";

        const access =
            options.access ??
            "public";

        if (
            access === "private"
        ) {
            const signedUrl =
                this.signedUrl(
                    key,
                    {
                        resourceType,
                        access:
                            "private",
                        expiresInSeconds:
                            60,
                    },
                );

            const response =
                await fetch(
                    signedUrl,
                );

            if (
                !response.ok
            ) {
                throw new Error(
                    `Unable to download private Cloudinary object: ${response.status}`,
                );
            }

            return Buffer.from(
                await response.arrayBuffer(),
            );
        }

        const url =
            buildCloudinaryUrl(
                key,
                resourceType,
                access,
            );

        const response =
            await fetch(
                url,
            );

        if (
            !response.ok
        ) {
            throw new Error(
                `Unable to download object from Cloudinary: ${response.status}`,
            );
        }

        return Buffer.from(
            await response.arrayBuffer(),
        );
    }

    async delete(
        key: string,
        options: {
            resourceType?: StorageResourceType;
            access?: StorageAccess;
        } = {},
    ): Promise<void> {
        const resourceType =
            options.resourceType ??
            "image";

        const access =
            options.access ??
            "public";

        const type =
            resolveCloudinaryType(
                access,
            );

        const result =
            await cloudinary
                .uploader
                .destroy(
                    key,
                    {
                        resource_type:
                            resourceType,

                        invalidate:
                            true,

                        type,
                    },
                );

        if (
            result.result !==
                "ok" &&
            result.result !==
                "not found"
        ) {
            throw new Error(
                `Unable to delete Cloudinary object "${key}": ${result.result}`,
            );
        }
    }

    async list(
        options: ObjectStorageListOptions = {},
    ): Promise<ObjectStorageItem[]> {
        const resourceType =
            options.resourceType ??
            "raw";

        const access =
            options.access ??
            "private";

        const maxResults =
            options.maxResults ??
            500;

        if (
            maxResults < 1
        ) {
            throw new Error(
                "maxResults must be greater than zero.",
            );
        }

        if (
            maxResults > 500
        ) {
            throw new Error(
                "maxResults cannot exceed 500.",
            );
        }

        const prefix =
            options.prefix?.replace(
                /^\/+/,
                "",
            );

        const resources: CloudinaryResourceResult[] =
            [];

        let nextCursor:
            | string
            | undefined;

        do {
            const result =
                await cloudinary
                    .api
                    .resources({
                        resource_type:
                            resourceType,

                        type:
                            resolveCloudinaryType(
                                access,
                            ),

                        ...(prefix
                            ? {
                                  prefix,
                              }
                            : {}),

                        max_results:
                            Math.min(
                                500,
                                maxResults -
                                    resources.length,
                            ),

                        ...(nextCursor
                            ? {
                                  next_cursor:
                                      nextCursor,
                              }
                            : {}),
                    });

            resources.push(
                ...result.resources,
            );

            nextCursor =
                result.next_cursor;

            if (
                resources.length >=
                maxResults
            ) {
                break;
            }

            if (
                !nextCursor
            ) {
                break;
            }
        } while (
            resources.length <
            maxResults
        );

        return resources
            .slice(
                0,
                maxResults,
            )
            .map(
                (
                    resource,
                ): ObjectStorageItem => {
                    const createdAt =
                        parseCreatedAt(
                            resource.created_at,
                        );

                    return {
                        key:
                            resource.public_id,

                        resourceType:
                            normalizeResourceType(
                                resource.resource_type,
                            ),

                        access:
                            normalizeAccessType(
                                resource.type,
                            ),

                        ...(createdAt
                            ? {
                                createdAt,
                            }
                            : {}),
                    };
                },
            );
    }

    publicUrl(
        key: string,
        options: ObjectStorageUrlOptions = {},
    ): string {
        const resourceType =
            options.resourceType ??
            "image";

        const access =
            options.access ??
            "public";

        if (
            access === "private"
        ) {
            throw new Error(
                "Private objects cannot use publicUrl(). Use signedUrl() instead.",
            );
        }

        return buildCloudinaryUrl(
            key,
            resourceType,
            access,
        );
    }

    signedUrl(
        key: string,
        options: {
            resourceType?: StorageResourceType;
            access?: StorageAccess;
            expiresInSeconds?: number;
            attachment?: boolean;
        } = {},
    ): string {
        const resourceType =
            options.resourceType ??
            "raw";

        const access =
            options.access ??
            "private";

        if (
            access !== "private"
        ) {
            throw new Error(
                "signedUrl() is only supported for private storage objects.",
            );
        }

        const expiresInSeconds =
            options.expiresInSeconds ??
            env.PRIVATE_DOCUMENT_SIGNED_URL_TTL_SECONDS;

        if (
            expiresInSeconds <= 0
        ) {
            throw new Error(
                "Signed URL expiration must be greater than zero.",
            );
        }

        const {
            publicId,
            format,
        } =
            splitCloudinaryKey(
                key,
            );

        const expiresAt =
            Math.floor(
                Date.now() / 1000,
            ) +
            expiresInSeconds;

        return cloudinary.utils.private_download_url(
            publicId,
            format,
            {
                resource_type:
                    resourceType,

                type:
                    "private",

                expires_at:
                    expiresAt,

                attachment:
                    options.attachment ??
                    false,
            },
        );
    }

    transformedImageUrl(
        key: string,
        options: ImageTransformationOptions = {},
    ): string {
        const transformation =
            buildImageTransformation(
                options,
            );

        return cloudinary.url(
            key,
            {
                secure: true,

                resource_type:
                    "image",

                type:
                    "upload",

                ...(Object.keys(
                    transformation,
                ).length > 0
                    ? {
                          transformation:
                              [
                                  transformation,
                              ],
                      }
                    : {}),
            },
        );
    }
}

let storage:
    | ObjectStorage
    | undefined;

export function getObjectStorage(): ObjectStorage {
    if (!storage) {
        storage =
            new CloudinaryObjectStorage();
    }

    return storage;
}

export function createObjectKey(
    prefix: string,
    extension = "",
): string {
    const date =
        new Date()
            .toISOString()
            .slice(
                0,
                10,
            );

    const normalizedPrefix =
        prefix
            .replace(
                /^\/+|\/+$/g,
                "",
            )
            .replace(
                /[^a-zA-Z0-9/_-]/g,
                "",
            );

    const normalizedExtension =
        extension
            .replace(
                /^\./,
                "",
            )
            .replace(
                /[^a-zA-Z0-9]/g,
                "",
            );

    const filename =
        normalizedExtension
            ? `${crypto.randomUUID()}.${normalizedExtension}`
            : crypto.randomUUID();

    return [
        env.CLOUDINARY_FOLDER,
        normalizedPrefix,
        date,
        filename,
    ]
        .filter(Boolean)
        .join("/");
}