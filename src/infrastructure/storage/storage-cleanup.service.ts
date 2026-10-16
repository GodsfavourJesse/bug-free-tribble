import { and, eq } from "drizzle-orm";

import { env } from "../../config/env.ts";
import { db } from "../../database/index.ts";

import {
    getObjectStorage,
} from "./object-storage.ts";

import type {
    ObjectStorageItem,
} from "./storage.types.ts";
import { dealerDocuments } from "../../database/schema/index.ts";

interface CleanupResult {
    scanned: number;
    referenced: number;
    deleted: number;
    skippedYoung: number;
    failed: number;
    deletedKeys: string[];
    failedKeys: string[];
}

function normalizePrefix(
    prefix: string,
): string {
    return prefix
        .replace(
            /^\/+/,
            "",
        )
        .replace(
            /\/+$/,
            "",
        );
}

function getDealerDocumentPrefix(): string {
    const folder =
        normalizePrefix(
            env.CLOUDINARY_FOLDER,
        );

    return [
        folder,
        "dealer-documents",
    ]
        .filter(Boolean)
        .join("/");
}

function isOlderThanGracePeriod(
    item: ObjectStorageItem,
    cutoff: Date,
): boolean {
    if (!item.createdAt) {
        return false;
    }

    return item.createdAt < cutoff;
}

async function getReferencedDealerDocumentKeys(): Promise<
    Set<string>
> {
    const rows =
        await db
            .select({
                objectKey:
                    dealerDocuments.objectKey,
            })
            .from(
                dealerDocuments,
            );

    return new Set(
        rows.map(
            (row) =>
                row.objectKey,
        ),
    );
}

function isDealerDocumentObject(
    item: ObjectStorageItem,
    prefix: string,
): boolean {
    return (
        item.access === "private" &&
        item.resourceType === "raw" &&
        item.key.startsWith(
            `${prefix}/`,
        )
    );
}

export async function cleanupOrphanedDealerDocuments(): Promise<
    CleanupResult
> {
    const storage =
        getObjectStorage();

    const prefix =
        getDealerDocumentPrefix();

    const gracePeriodMs =
        env.STORAGE_ORPHAN_GRACE_PERIOD_HOURS *
        60 *
        60 *
        1000;

    const cutoff =
        new Date(
            Date.now() -
                gracePeriodMs,
        );

    const referencedKeys =
        await getReferencedDealerDocumentKeys();

    const objects =
        await storage.list({
            prefix,
            resourceType:
                "raw",
            access:
                "private",
            maxResults:
                env.STORAGE_CLEANUP_BATCH_SIZE,
        });

    const result: CleanupResult = {
        scanned:
            objects.length,

        referenced: 0,

        deleted: 0,

        skippedYoung: 0,

        failed: 0,

        deletedKeys: [],

        failedKeys: [],
    };

    for (const object of objects) {
        if (
            !isDealerDocumentObject(
                object,
                prefix,
            )
        ) {
            continue;
        }

        if (
            referencedKeys.has(
                object.key,
            )
        ) {
            result.referenced += 1;
            continue;
        }

        if (
            !isOlderThanGracePeriod(
                object,
                cutoff,
            )
        ) {
            result.skippedYoung += 1;
            continue;
        }

        try {
            await storage.delete(
                object.key,
                {
                    resourceType:
                        "raw",

                    access:
                        "private",
                },
            );

            result.deleted += 1;

            result.deletedKeys.push(
                object.key,
            );
        } catch {
            result.failed += 1;

            result.failedKeys.push(
                object.key,
            );
        }
    }

    return result;
}