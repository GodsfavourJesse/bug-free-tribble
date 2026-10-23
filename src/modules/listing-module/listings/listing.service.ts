import {
    and,
    count,
    desc,
    eq,
    gt,
    ilike,
    isNull,
    or,
    sql,
    type SQL,
} from "drizzle-orm";

import { logger } from "../../../config/logger.ts";

import { env } from "../../../config/env.ts";

import { db } from "../../../database/index.ts";

import {
    idempotencyRecords,
    imageAnalysisJobs,
    listingHistory,
    listingImages,
    listings,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../../database/schema/index.ts";

import {
    createObjectKey,
    getObjectStorage,
} from "../../../infrastructure/storage/object-storage.ts";

import { 
    type ListingDetailsUpdate, 
    transitionListing 
} from "./listing.lifecycle.ts";

import {
    type GetListingViewer,
    type SellerListingsOptions,
    type SellerListingStatus,
} from "./listing.types.ts";

import {
    createAnonymousViewerKey,
    createAuthenticatedViewerKey,
    recordListingView,
} from "../listing-view/listing-view.service.ts";
import { normalizeImage } from "../../../infrastructure/storage/image-normalizer.ts";
import { validateImage } from "../../../infrastructure/storage/image-validator.ts";
import { consumeCreditUsingExecutor, CREDIT_REASONS } from "../../credits/credit.service.ts";
import { AppError } from "../../../errors/app-error.ts";
import { createHash } from "node:crypto";
import { enqueueImageAnalysisJob } from "../../image-module/image-analysis/image-analysis-job.service.ts";

const CREATE_LISTING_OPERATION = "CREATE_LISTING";

const IDEMPOTENCY_KEY_TTL_HOURS = 24;

interface CreateListingResult {
    listing: typeof listings.$inferSelect;
    replayed: boolean;
}

interface IdempotencyResponseBody
 extends Record<string, unknown> {
    success: true;
    data: {
        listing: typeof listings.$inferSelect;
    };
}

interface CreateListingInput {
    sellerId: string;
    vehicleVariantId: string;
    title: string;
    description: string;
    price: number;
    currency: string;
    mileage?: number;
    condition: "NEW" | "USED";
    country: string;
    state?: string;
    city?: string;
}

/*
 * ============================================================
 * LISTING CREATION ENTITLEMENT
 * ============================================================
 *
 * Business rules:
 *
 * 1. Free-trial credits do not expire.
 * 2. Subscription credits carry forward indefinitely.
 * 3. Once the free-trial allowance is exhausted, a valid
 *    paid entitlement is required to create new listings.
 * 4. A cancelled subscription retains entitlement until its
 *    recorded expiration date.
 * 5. Credit balance is checked separately by the centralized
 *    credit service.
 */

type DatabaseTransaction = Parameters<
    Parameters<typeof db.transaction>[0]
>[0];

type DatabaseExecutor =
    | typeof db
    | DatabaseTransaction;

async function getSellerListingImageSummaries(
    listingIds: string[],
) {
    type SellerImageSummary = {
        total: number;
        pending: number;
        passed: number;
        review: number;
        failed: number;
        images: {
            id: string;
            sortOrder: number;
            imageCheckStatus: string;
            imageCheckSource: string | null;
            checkReason: string | null;
            checkedAt: Date | null;
            url: string;
            thumbnailUrl: string;
            canRetry: boolean;
        }[];
    };

    if (listingIds.length === 0) {
        return new Map<string, SellerImageSummary>();
    }

    const images = await db
        .select({
            id: listingImages.id,
            listingId: listingImages.listingId,
            objectKey: listingImages.objectKey,
            sortOrder: listingImages.sortOrder,
            imageCheckStatus: listingImages.imageCheckStatus,
            imageCheckSource: listingImages.imageCheckSource,
            checkReason: listingImages.checkReason,
            checkedAt: listingImages.checkedAt,
        })
        .from(listingImages)
        .where(
            sql`${listingImages.listingId} IN (${sql.join(
                listingIds.map((id) => sql`${id}`),
                sql`, `,
            )})`,
        )
        .orderBy(
            listingImages.sortOrder,
        );

    const storage = getObjectStorage();

    const summaries = new Map<string, SellerImageSummary>();

    for (const image of images) {
        let summary = summaries.get(image.listingId);

        if (!summary) {
            summary = {
                total: 0,
                pending: 0,
                passed: 0,
                review: 0,
                failed: 0,
                images: [],
            };

            summaries.set(image.listingId, summary);
        }

        summary.total += 1;

        switch (image.imageCheckStatus) {
            case "PENDING":
                summary.pending += 1;
                break;

            case "PASSED":
                summary.passed += 1;
                break;

            case "REVIEW":
                summary.review += 1;
                break;

            case "FAILED":
                summary.failed += 1;
                break;
        }

        summary.images.push({
            id: image.id,
            sortOrder: image.sortOrder,
            imageCheckStatus: image.imageCheckStatus,
            imageCheckSource: image.imageCheckSource,
            checkReason: image.checkReason,
            checkedAt: image.checkedAt,

            url: storage.publicUrl(
                image.objectKey,
                {
                    resourceType: "image",
                    access: "public",
                },
            ),

            thumbnailUrl: storage.transformedImageUrl(
                image.objectKey,
                {
                    width: 600,
                    height: 600,
                    fit: "fit",
                    quality: "auto",
                    format: "webp",
                },
            ),

            canRetry:
                image.imageCheckStatus === "FAILED" &&
                image.imageCheckSource === "AUTOMATED",
        });
    }

    return summaries;
}

export async function createListing(
    input: CreateListingInput,
    idempotencyKey: string,
): Promise<CreateListingResult> {
    const normalizedKey = idempotencyKey.trim();

    if (
        normalizedKey.length === 0 ||
        normalizedKey.length > 255
    ) {
        throw new AppError(
            "A valid Idempotency-Key header is required.",
            400,
            "INVALID_IDEMPOTENCY_KEY",
        );
    }

    /*
     * Build a deterministic representation of the validated input.
     *
     * Explicit property ordering ensures that the same logical
     * payload produces the same hash.
     */
    const canonicalPayload = JSON.stringify({
        vehicleVariantId: input.vehicleVariantId,
        title: input.title,
        description: input.description,
        price: input.price,
        currency: input.currency,
        mileage: input.mileage ?? null,
        condition: input.condition,
        country: input.country,
        state: input.state ?? null,
        city: input.city ?? null,
    });

    const payloadHash = createHash("sha256")
        .update(canonicalPayload)
        .digest("hex");

    return db.transaction(async (tx) => {
        const now = new Date();

        /*
         * Expired records must not be reused while they still occupy
         * the unique key. Delete this user's expired record for this
         * operation/key before attempting to claim it.
         *
         * The delete and claim happen inside this transaction.
         */
        await tx
            .delete(idempotencyRecords)
            .where(
                and(
                    eq(
                        idempotencyRecords.userId,
                        input.sellerId,
                    ),
                    eq(
                        idempotencyRecords.operation,
                        CREATE_LISTING_OPERATION,
                    ),
                    eq(
                        idempotencyRecords.key,
                        normalizedKey,
                    ),
                    sql`${idempotencyRecords.expiresAt} <= ${now}`,
                ),
            );

        /*
         * Claim the key. The unique index serializes competing
         * requests using the same user, operation and key.
         */
        const claimed = await tx
            .insert(idempotencyRecords)
            .values({
                userId: input.sellerId,
                operation: CREATE_LISTING_OPERATION,
                key: normalizedKey,
                payloadHash,
                expiresAt: new Date(
                    now.getTime() +
                        IDEMPOTENCY_KEY_TTL_HOURS *
                            60 *
                            60 *
                            1000,
                ),
            })
            .onConflictDoNothing({
                target: [
                    idempotencyRecords.userId,
                    idempotencyRecords.operation,
                    idempotencyRecords.key,
                ],
            })
            .returning({
                id: idempotencyRecords.id,
            });

        /*
         * If another committed request already owns the key,
         * return its result when the payload matches.
         */
        if (claimed.length === 0) {
            const existingRows = await tx
                .select()
                .from(idempotencyRecords)
                .where(
                    and(
                        eq(
                            idempotencyRecords.userId,
                            input.sellerId,
                        ),
                        eq(
                            idempotencyRecords.operation,
                            CREATE_LISTING_OPERATION,
                        ),
                        eq(
                            idempotencyRecords.key,
                            normalizedKey,
                        ),
                    ),
                )
                .limit(1);

            const existing = existingRows[0];

            if (!existing) {
                throw new AppError(
                    "Unable to resolve the idempotency key. Please retry with a new key.",
                    409,
                    "IDEMPOTENCY_CONFLICT",
                );
            }

            if (existing.payloadHash !== payloadHash) {
                throw new AppError(
                    "This Idempotency-Key has already been used with a different listing payload.",
                    409,
                    "IDEMPOTENCY_KEY_REUSED",
                );
            }

            if (
                existing.responseBody === null ||
                existing.responseBody === undefined
            ) {
                throw new AppError(
                    "The original request result is unavailable. Please retry with a new Idempotency-Key.",
                    409,
                    "IDEMPOTENCY_RESULT_UNAVAILABLE",
                );
            }

            const responseBody =
                existing.responseBody as unknown as IdempotencyResponseBody;

            return {
                listing: responseBody.data.listing,
                replayed: true,
            };
        }

        /*
         * Only the request that successfully claimed the key
         * proceeds to create the listing.
         */
        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(
                hashtext(
                    ${`karmass:listing-credit:${input.sellerId}`}
                )
            )
        `);

        // await assertCanCreateListing(
        //     tx,
        //     input.sellerId,
        // );

        const variant = await tx
            .select({
                id: vehicleVariants.id,
            })
            .from(vehicleVariants)
            .where(
                eq(
                    vehicleVariants.id,
                    input.vehicleVariantId,
                ),
            )
            .limit(1);

        if (!variant[0]) {
            throw new AppError(
                "Vehicle variant not found.",
                404,
                "VEHICLE_VARIANT_NOT_FOUND",
            );
        }

        const inserted = await tx
            .insert(listings)
            .values({
                sellerId: input.sellerId,
                vehicleVariantId: input.vehicleVariantId,
                title: input.title,
                description: input.description,
                price: input.price.toString(),
                currency: input.currency,
                ...(input.mileage !== undefined
                    ? { mileage: input.mileage }
                    : {}),
                condition: input.condition,
                country: input.country,
                ...(input.state !== undefined
                    ? { state: input.state }
                    : {}),
                ...(input.city !== undefined
                    ? { city: input.city }
                    : {}),
                status: "DRAFT",
            })
            .returning();

        const listing = inserted[0];

        if (!listing) {
            throw new AppError(
                "Failed to create listing.",
                500,
                "LISTING_CREATE_FAILED",
            );
        }

        /*
         * The listing, credit debit, history and idempotency
         * response all commit or roll back together.
         */
        await consumeCreditUsingExecutor(tx, {
            userId: input.sellerId,
            reason: CREDIT_REASONS.LISTING_CREATED,
            referenceId: listing.id,
        });

        await tx
            .insert(listingHistory)
            .values({
                listingId: listing.id,
                actorId: input.sellerId,
                action: "CREATED",
                previousStatus: null,
                newStatus: "DRAFT",
                reason: "Listing created.",
            });

        const responseBody: IdempotencyResponseBody = {
            success: true,
            data: {
                listing,
            },
        };

        await tx
            .update(idempotencyRecords)
            .set({
                listingId: listing.id,
                responseStatus: 201,
                responseBody,
            })
            .where(
                eq(
                    idempotencyRecords.id,
                    claimed[0]!.id,
                ),
            );

        return {
            listing,
            replayed: false,
        };
    });
}

export async function getListingById(
    listingId: string,
    viewer?: GetListingViewer,
) {
    const result = await db
        .select({
            listing: listings,
            variant:
                vehicleVariants,
            generation:
                vehicleGenerations,
            model:
                vehicleModels,
            make:
                vehicleMakes,
        })
        .from(listings)
        .innerJoin(
            vehicleVariants,
            eq(
                listings.vehicleVariantId,
                vehicleVariants.id,
            ),
        )
        .innerJoin(
            vehicleGenerations,
            eq(
                vehicleVariants.generationId,
                vehicleGenerations.id,
            ),
        )
        .innerJoin(
            vehicleModels,
            eq(
                vehicleGenerations.modelId,
                vehicleModels.id,
            ),
        )
        .innerJoin(
            vehicleMakes,
            eq(
                vehicleModels.makeId,
                vehicleMakes.id,
            ),
        )
        .where(
            eq(
                listings.id,
                listingId,
            ),
        )
        .limit(1);

    const record =
        result[0];

    if (!record) {
        return null;
    }

    const images =
        await db
            .select()
            .from(listingImages)
            .where(
                eq(
                    listingImages.listingId,
                    listingId,
                ),
            )
            .orderBy(
                listingImages.sortOrder,
            );

    const storage =
        getObjectStorage();

    const imagesWithUrls =
        images.map((image) => ({
            ...image,

            url:
                storage.publicUrl(
                    image.objectKey,
                    {
                        resourceType:
                            "image",

                        access:
                            "public",
                    },
                ),

            thumbnailUrl:
                storage.transformedImageUrl(
                    image.objectKey,
                    {
                        width: 600,
                        height: 600,
                        fit: "fit",
                        quality: "auto",
                        format: "webp",
                    },
                ),

            detailUrl:
                storage.transformedImageUrl(
                    image.objectKey,
                    {
                        width: 1600,
                        height: 1600,
                        fit: "limit",
                        quality: "auto",
                        format: "webp",
                    },
                ),
        }));

    /*
     * View tracking is intentionally best-effort.
     *
     * A failure in the analytics/view system must never
     * prevent a valid listing from being returned to the user.
     */
    try {
        if (viewer?.userId) {
            await recordListingView({
                listingId,

                viewerId:
                    viewer.userId,

                viewerKey:
                    createAuthenticatedViewerKey(
                        viewer.userId,
                    ),
            });
        } else if (
            viewer?.visitorId
        ) {
            await recordListingView({
                listingId,

                viewerKey:
                    createAnonymousViewerKey(
                        viewer.visitorId,
                    ),
            });
        }
    } catch (error) {
        logger.error(
            {
                err: error,
                listingId,
            },
            "Failed to record listing view.",
        );
    }

    return {
        ...record,

        images:
            imagesWithUrls,
    };
}

export async function updateListing(
    listingId: string,
    sellerId: string,
    input: Partial<CreateListingInput>,
) {
    /*
     * 1. Verify listing ownership.
     */
    const result = await db
        .select()
        .from(listings)
        .where(
            and(
                eq(listings.id, listingId),
                eq(listings.sellerId, sellerId),
            ),
        )
        .limit(1);

    const listing = result[0];

    if (!listing) {
        throw new AppError(
            "Listing not found or you do not have permission to update it.",
            404,
            "LISTING_NOT_FOUND",
        );
    }

    /*
     * 2. Validate a replacement vehicle variant.
     */
    if (
        input.vehicleVariantId !== undefined
    ) {
        const variant = await db
            .select({
                id: vehicleVariants.id,
            })
            .from(vehicleVariants)
            .where(
                eq(
                    vehicleVariants.id,
                    input.vehicleVariantId,
                ),
            )
            .limit(1);

        if (!variant[0]) {
            throw new AppError(
                "The selected vehicle variant does not exist.",
                400,
                "INVALID_VEHICLE_VARIANT",
            );
        }
    }

    /*
     * 3. Build the details object.
     *
     * Omitted properties remain unchanged.
     */
    const details: ListingDetailsUpdate = {};

    if (input.vehicleVariantId !== undefined) {
        details.vehicleVariantId =
            input.vehicleVariantId;
    }

    if (input.title !== undefined) {
        details.title = input.title;
    }

    if (input.description !== undefined) {
        details.description = input.description;
    }

    if (input.price !== undefined) {
        details.price = input.price;
    }

    if (input.currency !== undefined) {
        details.currency = input.currency;
    }

    if (input.mileage !== undefined) {
        details.mileage = input.mileage;
    }

    if (input.condition !== undefined) {
        details.condition = input.condition;
    }

    if (input.country !== undefined) {
        details.country = input.country;
    }

    if (input.state !== undefined) {
        details.state = input.state;
    }

    if (input.city !== undefined) {
        details.city = input.city;
    }

    /*
     * 4. Reject empty updates.
     */
    if (Object.keys(details).length === 0) {
        throw new AppError(
            "Provide at least one listing field to update.",
            400,
            "EMPTY_LISTING_UPDATE",
        );
    }

    /*
     * 5. Apply the update through the lifecycle service.
     *
     * This ensures that:
     * - The lifecycle transition is validated.
     * - The listing status is updated appropriately.
     * - Listing history is recorded transactionally.
     */
    return transitionListing({
        listingId,
        actorId: sellerId,
        action: "UPDATE_DETAILS",
        details,
        reason: "Listing details updated by seller.",
    });
}

export async function deleteListing(
    listingId: string,
    sellerId: string,
) {
    /*
     * 1. Verify that the listing exists
     *    and belongs to the requesting seller.
     */
    const result = await db
        .select({
            id: listings.id,
        })
        .from(listings)
        .where(
            and(
                eq(listings.id, listingId),
                eq(listings.sellerId, sellerId),
            ),
        )
        .limit(1);

    if (!result[0]) {
        throw new AppError(
            "Listing not found or you do not have permission to delete it.",
            404,
            "LISTING_NOT_FOUND",
        );
    }

    /*
     * 2. Delete through the lifecycle service.
     *
     * The lifecycle service validates whether deletion
     * is allowed for the listing's current status.
     *
     * It also updates the status and records the action
     * in listingHistory within the same transaction.
     */
    return transitionListing({
        listingId,
        actorId: sellerId,
        action: "DELETE",
        reason: "Listing deleted by seller.",
    });
}

export async function addListingImage(
    listingId: string,
    sellerId: string,
    input: {
    file: Express.Multer.File;
    sortOrder: number;
    },
) {
    const storage = getObjectStorage();

    /*
    * Track the uploaded object so that if the database
    * transaction fails, we can clean up the orphaned object.
    */
    let uploadedObjectKey: string | undefined;

    try {
        const image = await db.transaction(async (tx) => {
            /*
            * Serialize image uploads for this listing.
            *
            * This protects the maximum-image-count check
            * against concurrent uploads.
            */
            await tx.execute(
                sql`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`,
            );

            /*
            * Verify listing ownership.
            */
            const listing = await tx
                .select({
                    id: listings.id,
                })
                .from(listings)
                .where(
                    and(
                        eq(listings.id, listingId),
                        eq(listings.sellerId, sellerId),
                    ),
                )
                .limit(1);

            if (!listing[0]) {
                throw new AppError(
                    "Listing not found or you do not have permission to upload images.",
                    404,
                    "LISTING_NOT_FOUND",
                );
            }

            /*
            * Enforce the maximum number of images.
            */
            const imageCountResult = await tx
                .select({
                    count: count(),
                })
                .from(listingImages)
                .where(
                    eq(
                        listingImages.listingId,
                        listingId,
                    ),
                );

            const imageCount = Number(
                imageCountResult[0]?.count ?? 0,
            );

            if (imageCount >= env.MAX_IMAGES_PER_LISTING) {
                throw new AppError(
                    `Maximum of ${env.MAX_IMAGES_PER_LISTING} images allowed per listing.`,
                    400,
                    "MAX_LISTING_IMAGES_EXCEEDED",
                );
            }

            /*
            * Validate the actual image contents.
            *
            * Do not trust the browser-provided MIME type.
            */
            await validateImage(input.file.buffer);

            /*
            * Normalize the image to WebP.
            */
            const normalized = await normalizeImage(
                input.file.buffer,
            );

            /*
            * Store the normalized image.
            */
            const objectKey = createObjectKey(
                `listings/${listingId}`,
                "webp",
            );

            uploadedObjectKey = objectKey;

            await storage.put(
                objectKey,
                normalized.buffer,
                "image/webp",
                {
                    resourceType: "image",
                    access: "public",
                    format: "webp",
                },
            );

            /*
            * Insert the image and its durable analysis job
            * inside the same database transaction.
            *
            * If either database insertion fails, the
            * transaction rolls back both records.
            */
            const insertedImages = await tx
                .insert(listingImages)
                .values({
                    listingId,
                    objectKey,
                    sortOrder: input.sortOrder,
                    imageCheckStatus: "PENDING",
                    mimeType: "image/webp",
                    width: normalized.width,
                    height: normalized.height,
                    ...(input.file.originalname
                        ? {
                            originalName:
                                input.file.originalname,
                        }
                        : {}),
                })
                .returning();

            const insertedImage = insertedImages[0];

            if (!insertedImage) {
                throw new AppError(
                    "Unable to create listing image.",
                    500,
                    "LISTING_IMAGE_CREATE_FAILED",
                );
            }

            /*
            * Queue image analysis automatically.
            *
            * Database defaults should initialize the job's
            * status, attempts, priority, and availability.
            */
            await tx
                .insert(imageAnalysisJobs)
                .values({
                    listingImageId: insertedImage.id,
                });

            return insertedImage;
        });

        /*
        * The database transaction has committed successfully.
        *
        * The background worker now owns image analysis.
        * Do not call analyzeImage() here.
        */
        return image;
    } catch (error) {
        /*
        * If storage succeeded but the database transaction
        * failed, clean up the stored object.
        */
        if (uploadedObjectKey !== undefined) {
            try {
                await storage.delete(
                    uploadedObjectKey,
                    {
                        resourceType: "image",
                    },
                );

                uploadedObjectKey = undefined;
            } catch (cleanupError) {
                logger.error(
                    {
                        err: cleanupError,
                        listingId,
                        objectKey: uploadedObjectKey,
                    },
                    "Failed to clean up orphaned listing image.",
                );
            }
        }

        throw error;
    }
}


export async function searchListings(
    search?: string,
) {
    const now =
        new Date();

    const conditions: SQL[] = [
        eq(
            listings.status,
            "APPROVED",
        ),
    ];

    const visibilityCondition =
        or(
            isNull(
                listings.expiresAt,
            ),
            gt(
                listings.expiresAt,
                now,
            ),
        );

    if (
        visibilityCondition
    ) {
        conditions.push(
            visibilityCondition,
        );
    }

    if (search) {
        const pattern =
            `%${search}%`;

        const searchCondition =
            or(
                ilike(
                    listings.title,
                    pattern,
                ),

                ilike(
                    listings.description,
                    pattern,
                ),

                ilike(
                    vehicleVariants.name,
                    pattern,
                ),

                ilike(
                    vehicleModels.name,
                    pattern,
                ),

                ilike(
                    vehicleMakes.name,
                    pattern,
                ),
            );

        if (
            searchCondition
        ) {
            conditions.push(
                searchCondition,
            );
        }
    }

    return db
        .select({
            listing: listings,

            variant:
                vehicleVariants,

            generation:
                vehicleGenerations,

            model:
                vehicleModels,

            make:
                vehicleMakes,
        })
        .from(listings)
        .innerJoin(
            vehicleVariants,
            eq(
                listings.vehicleVariantId,
                vehicleVariants.id,
            ),
        )
        .innerJoin(
            vehicleGenerations,
            eq(
                vehicleVariants.generationId,
                vehicleGenerations.id,
            ),
        )
        .innerJoin(
            vehicleModels,
            eq(
                vehicleGenerations.modelId,
                vehicleModels.id,
            ),
        )
        .innerJoin(
            vehicleMakes,
            eq(
                vehicleModels.makeId,
                vehicleMakes.id,
            ),
        )
        .where(
            and(...conditions),
        )
        .orderBy(
            desc(
                listings.createdAt,
            ),
        )
        .limit(50);
}

export async function submitListingForReview(
    listingId: string,
    sellerId: string,
) {
    const listingResult = await db
        .select({
            id: listings.id,
            sellerId: listings.sellerId,
            status: listings.status,
        })
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1);

    const listing = listingResult[0];

    if (!listing) {
        throw new AppError(
            "Listing not found.",
            404,
            "LISTING_NOT_FOUND",
        );
    }

    if (listing.sellerId !== sellerId) {
        throw new AppError(
            "You do not have permission to submit this listing.",
            403,
            "LISTING_SUBMISSION_FORBIDDEN",
        );
    }

    /*
     * Listing creation already consumed its credit.
     * Submission must not consume another credit.
     *
     * The centralized lifecycle service validates
     * whether the listing can enter review.
     */
    return transitionListing({
        listingId,
        action: "SUBMIT_FOR_REVIEW",
        actorId: sellerId,
    });
}

export async function restoreListing(
    listingId: string,
    sellerId: string,
) {
    const result =
        await db
            .select()
            .from(listings)
            .where(
                and(
                    eq(
                        listings.id,
                        listingId,
                    ),

                    eq(
                        listings.sellerId,
                        sellerId,
                    ),
                ),
            )
            .limit(1);

    const listing =
        result[0];

    if (!listing) {
        throw new Error(
            "Listing not found.",
        );
    }

    if (
        listing.status !==
        "DELETED"
    ) {
        throw new Error(
            "Only deleted listings can be restored.",
        );
    }

    return transitionListing({
        listingId,

        action:
            "RESTORE",

        actorId:
            sellerId,

        reason:
            "Listing restored by seller.",
    });
}

export async function markListingAsSold(
    listingId: string,
    sellerId: string,
) {
    const result =
        await db
            .select()
            .from(listings)
            .where(
                and(
                    eq(
                        listings.id,
                        listingId,
                    ),

                    eq(
                        listings.sellerId,
                        sellerId,
                    ),
                ),
            )
            .limit(1);

    const listing =
        result[0];

    if (!listing) {
        throw new Error(
            "Listing not found.",
        );
    }

    if (
        listing.status !==
        "APPROVED"
    ) {
        throw new Error(
            "Only approved listings can be marked as sold.",
        );
    }

    return transitionListing({
        listingId,

        action:
            "MARK_SOLD",

        actorId:
            sellerId,

        reason:
            "Listing marked as sold by seller.",
    });
}

export async function reactivateListing(
    listingId: string,
    sellerId: string,
) {
    const result = await db
        .select()
        .from(listings)
        .where(
            and(
                eq(listings.id, listingId),
                eq(listings.sellerId, sellerId),
            ),
        )
        .limit(1);

    const listing = result[0];

    if (!listing) {
        throw new AppError(
            "Listing not found or you do not have permission to reactivate it.",
            404,
            "LISTING_NOT_FOUND",
        );
    }

    switch (listing.status) {
        case "EXPIRED":
        case "SOLD":
        case "SUSPENDED":
            break;

        default:
            throw new AppError(
                "Only expired, sold, or suspended listings can be reactivated.",
                409,
                "LISTING_CANNOT_BE_REACTIVATED",
            );
    }

    return transitionListing({
        listingId,
        action: "REACTIVATE",
        actorId: sellerId,
        reason: "Listing reactivated by seller.",
    });
}

async function getListingCoverImages(
    listingIds: string[],
) {
    if (listingIds.length === 0) {
        return new Map<
            string,
            {
                id: string;
                objectKey: string;
                sortOrder: number;
                imageCheckStatus: string;
                thumbnailUrl: string;
                url: string;
            }
        >();
    }

    const images = await db
        .select({
            id: listingImages.id,
            listingId: listingImages.listingId,
            objectKey: listingImages.objectKey,
            sortOrder: listingImages.sortOrder,
            imageCheckStatus: listingImages.imageCheckStatus,
        })
        .from(listingImages)
        .where(
            and(
                sql`${listingImages.listingId} IN (${sql.join(
                    listingIds.map((id) => sql`${id}`),
                    sql`, `,
                )})`,
                eq(listingImages.imageCheckStatus, "PASSED"),
            ),
        )
        .orderBy(
            listingImages.sortOrder,
        );

    const storage = getObjectStorage();

    const coverImages = new Map<
        string,
        {
            id: string;
            objectKey: string;
            sortOrder: number;
            imageCheckStatus: string;
            thumbnailUrl: string;
            url: string;
        }
    >();

    for (const image of images) {
        if (coverImages.has(image.listingId)) {
            continue;
        }

        coverImages.set(
            image.listingId,
            {
                id: image.id,
                objectKey: image.objectKey,
                sortOrder: image.sortOrder,
                imageCheckStatus: image.imageCheckStatus,
                thumbnailUrl: storage.transformedImageUrl(
                    image.objectKey,
                    {
                        width: 600,
                        height: 600,
                        fit: "fit",
                        quality: "auto",
                        format: "webp",
                    },
                ),
                url: storage.publicUrl(
                    image.objectKey,
                    {
                        resourceType: "image",
                        access: "public",
                    },
                ),
            },
        );
    }

    return coverImages;
}

export async function getSellerListings(
    options: SellerListingsOptions,
) {
    const page = Math.max(
        options.page ?? 1,
        1,
    );

    const limit = Math.min(
        Math.max(
            options.limit ?? 20,
            1,
        ),
        100,
    );

    const offset = (page - 1) * limit;

    const conditions = [
        eq(
            listings.sellerId,
            options.sellerId,
        ),
    ];

    if (options.status) {
        conditions.push(
            eq(
                listings.status,
                options.status,
            ),
        );
    }

    const rows = await db
        .select({
            listing: listings,
            vehicleVariant: vehicleVariants,
            vehicleGeneration: vehicleGenerations,
            vehicleModel: vehicleModels,
            vehicleMake: vehicleMakes,
        })
        .from(listings)
        .innerJoin(
            vehicleVariants,
            eq(
                listings.vehicleVariantId,
                vehicleVariants.id,
            ),
        )
        .innerJoin(
            vehicleGenerations,
            eq(
                vehicleVariants.generationId,
                vehicleGenerations.id,
            ),
        )
        .innerJoin(
            vehicleModels,
            eq(
                vehicleGenerations.modelId,
                vehicleModels.id,
            ),
        )
        .innerJoin(
            vehicleMakes,
            eq(
                vehicleModels.makeId,
                vehicleMakes.id,
            ),
        )
        .where(
            and(...conditions),
        )
        .orderBy(
            desc(listings.createdAt),
        )
        .limit(limit)
        .offset(offset);

    const totalResult = await db
        .select({
            count: count(),
        })
        .from(listings)
        .where(
            and(...conditions),
        );

    const total = Number(
        totalResult[0]?.count ?? 0,
    );

    const listingIds = rows.map(
        (row) => row.listing.id,
    );

    const [
        coverImages,
        imageSummaries,
    ] = await Promise.all([
        getListingCoverImages(listingIds),
        getSellerListingImageSummaries(listingIds),
    ]);

    const items = rows.map((row) => ({
        ...row,

        coverImage:
            coverImages.get(row.listing.id) ?? null,

        imageAnalysis:
            imageSummaries.get(row.listing.id) ?? {
                total: 0,
                pending: 0,
                passed: 0,
                review: 0,
                failed: 0,
                images: [],
            },
    }));

    return {
        items,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            hasPreviousPage: page > 1,
        },
    };
}

export async function getSellerListingSummary(
    sellerId: string,
) {
    const rows =
        await db
            .select({
                status:
                    listings.status,

                count:
                    count(),
            })
            .from(listings)
            .where(
                eq(
                    listings.sellerId,
                    sellerId,
                ),
            )
            .groupBy(
                listings.status,
            );

    const summary: Record<
        SellerListingStatus,
        number
    > = {
        DRAFT: 0,

        PENDING_REVIEW: 0,

        APPROVED: 0,

        REJECTED: 0,

        EXPIRED: 0,

        SOLD: 0,

        SUSPENDED: 0,

        DELETED: 0,
    };

    for (const row of rows) {
        summary[
            row.status
        ] = Number(
            row.count,
        );
    }

    return {
        ...summary,

        total:
            Object.values(
                summary,
            ).reduce(
                (
                    total,
                    value,
                ) =>
                    total +
                    value,
                0,
            ),
    };
}

export async function retrySellerImageAnalysis(
    listingId: string,
    imageId: string,
    sellerId: string,
) {
    const [image] = await db
        .select({
            id: listingImages.id,
            listingId: listingImages.listingId,
        })
        .from(listingImages)
        .innerJoin(
            listings,
            eq(
                listingImages.listingId,
                listings.id,
            ),
        )
        .where(
            and(
                eq(listingImages.id, imageId),
                eq(listingImages.listingId, listingId),
                eq(listings.sellerId, sellerId),
            ),
        )
        .limit(1);

    if (!image) {
        throw new AppError(
            "Image not found or you do not have permission to retry its analysis.",
            404,
            "LISTING_IMAGE_NOT_FOUND",
        );
    }

    try {
        return await enqueueImageAnalysisJob({
            listingImageId: image.id,
            retryTechnicalFailure: true,
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "";

        if (
            message.includes("already passed review")
        ) {
            throw new AppError(
                "This image has already passed its checks.",
                409,
                "IMAGE_ALREADY_PASSED",
            );
        }

        if (
            message.includes("not identified as an automated-analysis failure")
        ) {
            throw new AppError(
                "This image cannot be retried automatically because its failure was not confirmed as an automated-analysis failure.",
                409,
                "IMAGE_RETRY_NOT_ALLOWED",
            );
        }

        if (
            message.includes("Only failed images")
        ) {
            throw new AppError(
                "Only failed images can be retried.",
                409,
                "IMAGE_NOT_ELIGIBLE_FOR_RETRY",
            );
        }

        if (
            message.includes("active image-analysis job already exists")
        ) {
            throw new AppError(
                "An analysis job already exists for this image. Please refresh and try again.",
                409,
                "IMAGE_ANALYSIS_ALREADY_ACTIVE",
            );
        }

        if (
            message.includes("not awaiting analysis")
        ) {
            throw new AppError(
                "This image is not eligible for retry.",
                409,
                "IMAGE_NOT_ELIGIBLE_FOR_RETRY",
            );
        }

        throw error;
    }
}
