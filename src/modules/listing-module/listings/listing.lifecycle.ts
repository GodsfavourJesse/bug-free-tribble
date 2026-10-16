import {
    and,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";
import { writeAuditRecord } from "../../../helpers/audit/audit.service.ts";

import {
    listingHistory,
    listings,
} from "../../../database/schema/index.ts";

import {
    allowedTransitions,
    historyActionMap,
    type ListingLifecycleAction,
    type ListingStatus,
} from "./listing.types.ts";

/**
 * Determines whether a lifecycle action is permitted
 * for a listing's current status.
 */
export function canTransitionListing(
    from: ListingStatus,
    action: ListingLifecycleAction,
): boolean {
    return (
        allowedTransitions[from]?.[action] !==
        undefined
    );
}

/**
 * Resolves the status produced by a lifecycle action.
 *
 * Throws when the requested transition is invalid.
 */
export function getListingTransitionTarget(
    from: ListingStatus,
    action: ListingLifecycleAction,
): ListingStatus {
    const target =
        allowedTransitions[from]?.[action];

    if (target === undefined) {
        throw new Error(
            `Invalid listing lifecycle transition: ${from} -> ${action}.`,
        );
    }

    return target;
}

/**
 * Fields sellers are allowed to change when
 * updating an existing listing.
 */
export interface ListingDetailsUpdate {
    vehicleVariantId?: string;
    title?: string;
    description?: string;
    price?: number;
    currency?: string;
    mileage?: number;
    condition?: "NEW" | "USED";
    country?: string;
    state?: string;
    city?: string;
}

/**
 * Options accepted by the lifecycle service.
 */
export interface TransitionListingOptions {
    listingId: string;
    action: ListingLifecycleAction;
    actorId?: string | null;
    reason?: string;
    rejectionReason?: string;
    expiresAt?: Date;
    metadata?: string;
    details?: ListingDetailsUpdate;
}

/**
 * Applies seller-provided listing details to an update object.
 *
 * Only explicitly supplied fields are changed.
 * This preserves existing values for omitted fields.
 */
function applyListingDetails(
    values: Partial<
        typeof listings.$inferInsert
    >,
    details: ListingDetailsUpdate | undefined,
): void {
    if (!details) {
        throw new Error(
            "Listing details are required for this action.",
        );
    }

    let hasChanges = false;

    if (details.vehicleVariantId !== undefined) {
        values.vehicleVariantId =
            details.vehicleVariantId;

        hasChanges = true;
    }

    if (details.title !== undefined) {
        values.title =
            details.title;

        hasChanges = true;
    }

    if (details.description !== undefined) {
        values.description =
            details.description;

        hasChanges = true;
    }

    if (details.price !== undefined) {
        if (
            !Number.isFinite(details.price) ||
            details.price < 0
        ) {
            throw new Error(
                "Listing price must be a valid non-negative number.",
            );
        }

        values.price = String(details.price);

        hasChanges = true;
    }

    if (details.currency !== undefined) {
        values.currency =
            details.currency;

        hasChanges = true;
    }

    if (details.mileage !== undefined) {
        values.mileage =
            details.mileage;

        hasChanges = true;
    }

    if (details.condition !== undefined) {
        values.condition =
            details.condition;

        hasChanges = true;
    }

    if (details.country !== undefined) {
        values.country =
            details.country;

        hasChanges = true;
    }

    if (details.state !== undefined) {
        values.state =
            details.state;

        hasChanges = true;
    }

    if (details.city !== undefined) {
        values.city =
            details.city;

        hasChanges = true;
    }

    if (!hasChanges) {
        throw new Error(
            "At least one listing field must be provided for an update.",
        );
    }
}

/**
 * Handles all listing lifecycle transitions.
 *
 * This service is responsible for:
 * - Validating the current lifecycle status.
 * - Applying lifecycle-specific field changes.
 * - Updating listing status.
 * - Recording listing history.
 * - Protecting against concurrent status changes.
 *
 * All database mutations occur inside one transaction.
 */
export async function transitionListing(
    options: TransitionListingOptions,
) {
    return db.transaction(async (tx) => {
        /*
         * 1. Fetch the listing.
         */
        const result = await tx
            .select()
            .from(listings)
            .where(
                eq(
                    listings.id,
                    options.listingId,
                ),
            )
            .limit(1);

        const listing = result[0];

        if (!listing) {
            throw new Error(
                "Listing not found.",
            );
        }

        /*
         * 2. Resolve the current and next statuses.
         */
        const currentStatus =
            listing.status as ListingStatus;

        const nextStatus =
            getListingTransitionTarget(
                currentStatus,
                options.action,
            );

        /*
         * 3. Prepare the database update.
         */
        const values: Partial<
            typeof listings.$inferInsert
        > = {
            status: nextStatus,
            updatedAt: new Date(),
        };

        /*
         * UPDATE_DETAILS
         *
         * Apply only the fields supplied by the seller.
         *
         * Editing a published or rejected listing sends it
         * back to review when the corresponding transition
         * is configured in listing.types.ts.
         *
         * A listing being edited must not remain publicly
         * published while its updated details await review.
         */
        if (options.action === "UPDATE_DETAILS") {
            applyListingDetails(
                values,
                options.details,
            );

            if (
                currentStatus === "APPROVED" ||
                currentStatus === "REJECTED"
            ) {
                values.publishedAt = null;
                values.expiresAt = null;
                values.rejectionReason = null;
            }
        }

        /*
         * REJECT
         *
         * A rejected listing must have a meaningful reason.
         */
        if (options.action === "REJECT") {
            const rejectionReason =
                options.rejectionReason?.trim();

            if (!rejectionReason) {
                throw new Error(
                    "A rejection reason is required.",
                );
            }

            values.rejectionReason =
                rejectionReason;
        }

        /*
         * APPROVE
         *
         * Every approval starts a fresh publication period.
         *
         * The caller must supply a valid future expiry date.
         */
        if (options.action === "APPROVE") {
            const expiresAt =
                options.expiresAt;

            if (
                !expiresAt ||
                Number.isNaN(
                    expiresAt.getTime(),
                ) ||
                expiresAt.getTime() <= Date.now()
            ) {
                throw new Error(
                    "A valid future expiry date is required to approve a listing.",
                );
            }

            const publishedAt = new Date();

            if (
                expiresAt.getTime() <=
                publishedAt.getTime()
            ) {
                throw new Error(
                    "The listing expiry date must be later than its publication date.",
                );
            }

            values.publishedAt =
                publishedAt;

            values.expiresAt =
                expiresAt;

            values.rejectionReason =
                null;
        }

        /*
         * EXPIRE
         *
         * Preserve the original expiry timestamp
         * for historical accuracy.
         */
        if (options.action === "EXPIRE") {
            values.expiresAt =
                listing.expiresAt;
        }

        /*
         * REACTIVATE
         *
         * Return the listing to review.
         * Approval will establish new publication dates.
         */
        if (options.action === "REACTIVATE") {
            values.publishedAt = null;

            values.expiresAt = null;

            values.rejectionReason = null;
        }

        /*
         * RESTORE
         *
         * A deleted listing returns to a clean draft.
         */
        if (options.action === "RESTORE") {
            values.publishedAt = null;

            values.expiresAt = null;

            values.rejectionReason = null;
        }

        /*
         * SUBMIT_FOR_REVIEW
         *
         * Clear an old rejection reason when a seller
         * submits a listing again.
         */
        if (
            options.action ===
            "SUBMIT_FOR_REVIEW"
        ) {
            values.rejectionReason = null;
        }

        /*
         * 4. Update the listing.
         *
         * The status condition protects against a concurrent
         * request changing the listing's lifecycle status
         * after we read it.
         */
        const updated = await tx
            .update(listings)
            .set(values)
            .where(
                and(
                    eq(
                        listings.id,
                        options.listingId,
                    ),
                    eq(
                        listings.status,
                        currentStatus,
                    ),
                ),
            )
            .returning();

        const updatedListing =
            updated[0];

        if (!updatedListing) {
            throw new Error(
                "Listing was modified by another request. Please try again.",
            );
        }

        /*
         * 5. Record lifecycle history.
         *
         * actorId may be null for system-generated
         * actions, such as automatic expiry.
         */
        const rejectionReason =
            options.rejectionReason?.trim();

        const reason =
            options.action === "REJECT"
                ? rejectionReason
                : options.reason?.trim();

        await tx
            .insert(listingHistory)
            .values({
                listingId:
                    options.listingId,

                actorId:
                    options.actorId ?? null,

                action:
                    historyActionMap[
                        options.action
                    ],

                previousStatus:
                    currentStatus,

                newStatus:
                    nextStatus,

                ...(reason
                    ? { reason }
                    : {}),

                ...(options.metadata !== undefined
                    ? {
                          metadata:
                              options.metadata,
                      }
                    : {}),
            });

        // Administrative moderation actions are recorded in the same
        // transaction as the lifecycle transition. Do not store free-text
        // rejection reasons or raw listing/user payloads in the audit log.
        if (
            options.action === "APPROVE" ||
            options.action === "REJECT" ||
            options.action === "SUSPEND"
        ) {
            await writeAuditRecord(tx, {
                ...(options.actorId ? { actorUserId: options.actorId } : {}),
                action: options.action === "APPROVE"
                    ? "LISTING_APPROVED"
                    : options.action === "REJECT"
                      ? "LISTING_REJECTED"
                      : "LISTING_SUSPENDED",
                entityType: "LISTING",
                entityId: options.listingId,
                metadata: {
                    previousStatus: currentStatus,
                    newStatus: nextStatus,
                },
            });
        }

        /*
         * 6. Return the updated listing and transition details.
         */
        return {
            listing: updatedListing,

            previousStatus:
                currentStatus,

            newStatus:
                nextStatus,

            actorId:
                options.actorId ?? null,

            action:
                options.action,
        };
    });
}