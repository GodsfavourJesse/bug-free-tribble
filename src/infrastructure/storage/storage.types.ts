export type StorageResourceType =
    | "image"
    | "raw"
    | "video"
    | "auto";

export type StorageAccess =
    | "public"
    | "private";

export type ImageFit =
    | "scale"
    | "fit"
    | "limit"
    | "fill"
    | "pad"
    | "crop";

export interface ObjectStoragePutOptions {
    resourceType?: StorageResourceType;
    access?: StorageAccess;
    folder?: string;
    format?: string;
}

export interface ObjectStorageUrlOptions {
    resourceType?: StorageResourceType;
    access?: StorageAccess;
    expiresInSeconds?: number;
}

export interface ImageTransformationOptions {
    width?: number;
    height?: number;
    fit?: ImageFit;
    quality?: number | "auto";
    format?: "webp" | "avif" | "jpg" | "png";
}

export interface ObjectStorageListOptions {
    prefix?: string;
    resourceType?: StorageResourceType;
    access?: StorageAccess;
    maxResults?: number;
}

export interface ObjectStorageItem {
    key: string;
    resourceType: StorageResourceType;
    access: StorageAccess;
    createdAt?: Date;
}

export interface ObjectStorage {
    put(
        key: string,
        body: Buffer,
        contentType: string,
        options?: ObjectStoragePutOptions,
    ): Promise<{
        key: string;
        url: string;
        resourceType: StorageResourceType;
    }>;

    get(
        key: string,
        options?: {
            resourceType?: StorageResourceType;
            access?: StorageAccess;
        },
    ): Promise<Buffer>;

    delete(
        key: string,
        options?: {
            resourceType?: StorageResourceType;
            access?: StorageAccess;
        },
    ): Promise<void>;

    list(
        options?: ObjectStorageListOptions,
    ): Promise<ObjectStorageItem[]>;

    publicUrl(
        key: string,
        options?: ObjectStorageUrlOptions,
    ): string;

    signedUrl(
        key: string,
        options?: {
            resourceType?: StorageResourceType;
            access?: StorageAccess;
            expiresInSeconds?: number;
            attachment?: boolean;
        },
    ): string;

    transformedImageUrl(
        key: string,
        options?: ImageTransformationOptions,
    ): string;
}