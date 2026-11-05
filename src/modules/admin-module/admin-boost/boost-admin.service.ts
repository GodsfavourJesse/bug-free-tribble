import {
    and,
    desc,
    eq,
    inArray,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";
import { writeAuditRecord } from "../../../helpers/audit/audit.service.ts";

import {
    boostPlans,
    listingBoosts,
    listings,
    payments,
    users,
} from "../../../database/schema/index.ts";

export type AdminBoostStatus =
    | "PENDING"
    | "AWAITING_APPROVAL"
    | "ACTIVE"
    | "REJECTED"
    | "EXPIRED"
    | "CANCELLED";

export interface AdminBoostListInput {
    status?: AdminBoostStatus;
    page?: number;
    limit?: number;
}

export interface ReviewBoostInput {
    boostId: string;
    adminUserId: string;
    reviewNote?: string;
}

export interface CreateAdminBoostPlanInput {
    durationDays: number;
    price: number;
    currency: string;
    active: number;
    adminUserId: string;
}

export interface UpdateAdminBoostPlanInput {
    planId: string;
    adminUserId: string;
    durationDays?: number;
    price?: number;
    currency?: string;
    active?: number;
}

export interface DeleteAdminBoostPlanInput {
    planId: string;
    adminUserId: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const RESERVED_BOOST_STATUSES = [
    "PENDING",
    "AWAITING_APPROVAL",
    "ACTIVE",
] as const;

function normalizePagination(
    page?: number,
    limit?: number,
) {
    const normalizedPage =
        Number.isInteger(page) && (page ?? 0) > 0
            ? page!
            : DEFAULT_PAGE;

    const normalizedLimit =
        Number.isInteger(limit) && (limit ?? 0) > 0
            ? Math.min(limit!, MAX_LIMIT)
            : DEFAULT_LIMIT;

    return {
        page: normalizedPage,
        limit: normalizedLimit,
        offset: (normalizedPage - 1) * normalizedLimit,
    };
}

/**
 * List boost requests for administrators.
 */
export async function listAdminBoosts(
    input: AdminBoostListInput = {},
) {
    const { page, limit, offset } =
        normalizePagination(
            input.page,
            input.limit,
        );

    const whereClause = input.status
        ? eq(listingBoosts.status, input.status)
        : undefined;

    const [items, countRows] = await Promise.all([
        db
            .select({
                id: listingBoosts.id,
                listingId: listingBoosts.listingId,
                boostPlanId: listingBoosts.boostPlanId,
                status: listingBoosts.status,
                paymentVerifiedAt:
                    listingBoosts.paymentVerifiedAt,
                reviewedBy: listingBoosts.reviewedBy,
                reviewedAt: listingBoosts.reviewedAt,
                reviewNote: listingBoosts.reviewNote,
                startsAt: listingBoosts.startsAt,
                expiresAt: listingBoosts.expiresAt,
                createdAt: listingBoosts.createdAt,

                durationDays: boostPlans.durationDays,
                price: boostPlans.price,
                currency: boostPlans.currency,

                listingTitle: listings.title,
                listingStatus: listings.status,
                sellerId: listings.sellerId,

                sellerEmail: users.email,
            })
            .from(listingBoosts)
            .innerJoin(
                boostPlans,
                eq(
                    listingBoosts.boostPlanId,
                    boostPlans.id,
                ),
            )
            .innerJoin(
                listings,
                eq(
                    listingBoosts.listingId,
                    listings.id,
                ),
            )
            .innerJoin(
                users,
                eq(
                    listings.sellerId,
                    users.id,
                ),
            )
            .where(whereClause)
            .orderBy(desc(listingBoosts.createdAt))
            .limit(limit)
            .offset(offset),

        db
            .select({
                total: sql<number>`count(*)::int`,
            })
            .from(listingBoosts)
            .where(whereClause),
    ]);

    const total = countRows[0]?.total ?? 0;

    return {
        items,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

/**
 * Retrieve a boost request and its payment records.
 */
export async function getAdminBoostDetails(
    boostId: string,
) {
    const [boost] = await db
        .select({
            id: listingBoosts.id,
            listingId: listingBoosts.listingId,
            boostPlanId: listingBoosts.boostPlanId,
            status: listingBoosts.status,
            paymentVerifiedAt:
                listingBoosts.paymentVerifiedAt,
            reviewedBy: listingBoosts.reviewedBy,
            reviewedAt: listingBoosts.reviewedAt,
            reviewNote: listingBoosts.reviewNote,
            startsAt: listingBoosts.startsAt,
            expiresAt: listingBoosts.expiresAt,
            createdAt: listingBoosts.createdAt,

            durationDays: boostPlans.durationDays,
            price: boostPlans.price,
            currency: boostPlans.currency,

            listingTitle: listings.title,
            listingStatus: listings.status,
            sellerId: listings.sellerId,
            sellerEmail: users.email,
        })
        .from(listingBoosts)
        .innerJoin(
            boostPlans,
            eq(
                listingBoosts.boostPlanId,
                boostPlans.id,
            ),
        )
        .innerJoin(
            listings,
            eq(
                listingBoosts.listingId,
                listings.id,
            ),
        )
        .innerJoin(
            users,
            eq(
                listings.sellerId,
                users.id,
            ),
        )
        .where(eq(listingBoosts.id, boostId))
        .limit(1);

    if (!boost) {
        throw new Error("Boost not found.");
    }

    const paymentRecords = await db
        .select()
        .from(payments)
        .where(
            eq(payments.listingBoostId, boostId),
        )
        .orderBy(desc(payments.createdAt));

    return {
        ...boost,
        payments: paymentRecords,
    };
}

/**
 * Approve a paid boost request.
 *
 * Requirements:
 * - The boost must await approval.
 * - paymentVerifiedAt must be set.
 * - A matching successful BOOST payment must exist.
 * - The payment must belong to the listing owner.
 * - The listing must not already have another reserved boost.
 *
 * The boost duration begins at approval time.
 */
export async function approveBoostRequest(
    input: ReviewBoostInput,
) {
    return db.transaction(async (tx) => {
        /*
         * First identify the listing. The listing-level lock must
         * use the same key as boost creation and payment fulfillment.
         */
        const [initial] = await tx
            .select({
                listingId: listingBoosts.listingId,
            })
            .from(listingBoosts)
            .where(
                eq(
                    listingBoosts.id,
                    input.boostId,
                ),
            )
            .limit(1);

        if (!initial) {
            throw new Error("Boost not found.");
        }

        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(
                hashtext(
                    ${`karmass:listing-boost:${initial.listingId}`}
                )
            )
        `);

        /*
         * Lock and re-read the boost after acquiring the listing lock.
         */
        const [boost] = await tx
            .select({
                id: listingBoosts.id,
                status: listingBoosts.status,
                listingId: listingBoosts.listingId,
                boostPlanId: listingBoosts.boostPlanId,
                paymentVerifiedAt:
                    listingBoosts.paymentVerifiedAt,

                durationDays: boostPlans.durationDays,

                sellerId: listings.sellerId,
                listingStatus: listings.status,
            })
            .from(listingBoosts)
            .innerJoin(
                boostPlans,
                eq(
                    listingBoosts.boostPlanId,
                    boostPlans.id,
                ),
            )
            .innerJoin(
                listings,
                eq(
                    listingBoosts.listingId,
                    listings.id,
                ),
            )
            .where(
                eq(
                    listingBoosts.id,
                    input.boostId,
                ),
            )
            .limit(1)
            .for("update", {
                of: listingBoosts,
            });

        if (!boost) {
            throw new Error("Boost not found.");
        }

        if (boost.status !== "AWAITING_APPROVAL") {
            throw new Error(
                "Only boost requests awaiting approval can be approved.",
            );
        }

        if (!boost.paymentVerifiedAt) {
            throw new Error(
                "Payment must be verified before approving this boost.",
            );
        }

        if (
            boost.listingStatus !== "APPROVED"
        ) {
            throw new Error(
                "The associated listing must be approved before the boost can be activated.",
            );
        }

        /*
         * Confirm that the payment is successful and belongs to
         * this boost, the listing owner, and the BOOST purpose.
         */
        const successfulPayments = await tx
            .select({
                id: payments.id,
                userId: payments.userId,
                amount: payments.amount,
                currency: payments.currency,
                paidAt: payments.paidAt,
            })
            .from(payments)
            .where(
                and(
                    eq(
                        payments.listingBoostId,
                        input.boostId,
                    ),
                    eq(
                        payments.purpose,
                        "BOOST",
                    ),
                    eq(
                        payments.status,
                        "SUCCESS",
                    ),
                ),
            )
            .limit(2);

        if (successfulPayments.length !== 1) {
            throw new Error(
                "Exactly one successful boost payment is required before approval.",
            );
        }

        const successfulPayment = successfulPayments[0];

        if (
            !successfulPayment ||
            successfulPayment.userId !== boost.sellerId
        ) {
            throw new Error(
                "Successful payment ownership does not match the listing owner.",
            );
        }

        if (
            !successfulPayment.paidAt ||
            successfulPayment.paidAt.getTime() >
                boost.paymentVerifiedAt.getTime()
        ) {
            throw new Error(
                "The successful payment timestamp is inconsistent with boost payment verification.",
            );
        }

        /*
         * Protect against any existing PENDING, AWAITING_APPROVAL,
         * or ACTIVE boost for the same listing.
         *
         * The listing-level advisory lock serializes cooperating
         * boost creation, fulfillment, and approval operations.
         */
        const conflictingBoosts = await tx
            .select({
                id: listingBoosts.id,
            })
            .from(listingBoosts)
            .where(
                and(
                    eq(
                        listingBoosts.listingId,
                        boost.listingId,
                    ),
                    inArray(
                        listingBoosts.status,
                        RESERVED_BOOST_STATUSES,
                    ),
                    sql`${listingBoosts.id} <> ${input.boostId}`,
                ),
            )
            .limit(1);

        if (conflictingBoosts.length > 0) {
            throw new Error(
                "Another boost request or active boost exists for this listing.",
            );
        }

        const startsAt = new Date();

        const expiresAt = new Date(
            startsAt.getTime() +
                boost.durationDays * 24 * 60 * 60 * 1000,
        );

        const [updatedBoost] = await tx
            .update(listingBoosts)
            .set({
                status: "ACTIVE",
                reviewedBy: input.adminUserId,
                reviewedAt: startsAt,
                reviewNote:
                    input.reviewNote?.trim() || null,
                startsAt,
                expiresAt,
            })
            .where(
                and(
                    eq(
                        listingBoosts.id,
                        input.boostId,
                    ),
                    eq(
                        listingBoosts.status,
                        "AWAITING_APPROVAL",
                    ),
                ),
            )
            .returning();

        if (!updatedBoost) {
            throw new Error(
                "The boost request changed before it could be approved. Refresh and try again.",
            );
        }

        await writeAuditRecord(tx, {
            actorUserId: input.adminUserId,
            action: "BOOST_APPROVED",
            entityType: "LISTING_BOOST",
            entityId: updatedBoost.id,
            metadata: {
                listingId: updatedBoost.listingId,
                previousStatus: "AWAITING_APPROVAL",
                newStatus: updatedBoost.status,
                durationDays: boost.durationDays,
            },
        });

        return updatedBoost;
    });
}

/**
 * Reject a boost request awaiting administrator approval.
 */
export async function rejectBoostRequest(
    input: ReviewBoostInput,
) {
    const reviewNote = input.reviewNote?.trim();

    if (!reviewNote) {
        throw new Error(
            "A rejection reason is required.",
        );
    }

    return db.transaction(async (tx) => {
        const [initial] = await tx
            .select({
                listingId: listingBoosts.listingId,
            })
            .from(listingBoosts)
            .where(
                eq(
                    listingBoosts.id,
                    input.boostId,
                ),
            )
            .limit(1);

        if (!initial) {
            throw new Error("Boost not found.");
        }

        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(
                hashtext(
                    ${`karmass:listing-boost:${initial.listingId}`}
                )
            )
        `);

        const [boost] = await tx
            .select({
                id: listingBoosts.id,
                status: listingBoosts.status,
            })
            .from(listingBoosts)
            .where(
                eq(
                    listingBoosts.id,
                    input.boostId,
                ),
            )
            .limit(1)
            .for("update");

        if (!boost) {
            throw new Error("Boost not found.");
        }

        if (boost.status !== "AWAITING_APPROVAL") {
            throw new Error(
                "Only boost requests awaiting approval can be rejected.",
            );
        }

        const [updatedBoost] = await tx
            .update(listingBoosts)
            .set({
                status: "REJECTED",
                reviewedBy: input.adminUserId,
                reviewedAt: new Date(),
                reviewNote,
            })
            .where(
                and(
                    eq(
                        listingBoosts.id,
                        input.boostId,
                    ),
                    eq(
                        listingBoosts.status,
                        "AWAITING_APPROVAL",
                    ),
                ),
            )
            .returning();

        if (!updatedBoost) {
            throw new Error(
                "The boost request changed before it could be rejected. Refresh and try again.",
            );
        }

        await writeAuditRecord(tx, {
            actorUserId: input.adminUserId,
            action: "BOOST_REJECTED",
            entityType: "LISTING_BOOST",
            entityId: updatedBoost.id,
            metadata: {
                previousStatus: "AWAITING_APPROVAL",
                newStatus: updatedBoost.status,
            },
        });

        return updatedBoost;
    });
}

/**
 * List all boost plans for administrators.
 *
 * Unlike the public boost plan service, this includes
 * inactive plans.
 */
export async function listAdminBoostPlans() {
    return db
        .select({
            id: boostPlans.id,
            durationDays: boostPlans.durationDays,
            price: boostPlans.price,
            currency: boostPlans.currency,
            active: boostPlans.active,
            createdAt: boostPlans.createdAt,

            totalBoosts: sql<number>`
                (
                    SELECT COUNT(*)::int
                    FROM listing_boosts
                    WHERE listing_boosts.boost_plan_id = ${boostPlans.id}
                )
            `,
        })
        .from(boostPlans)
        .orderBy(
            desc(boostPlans.createdAt),
        );
}

/**
 * Create a new boost plan.
 */
export async function createAdminBoostPlan(
    input: CreateAdminBoostPlanInput,
) {
    return db.transaction(async (tx) => {
        const [plan] = await tx
            .insert(boostPlans)
            .values({
                durationDays: input.durationDays,
                price: input.price.toFixed(2),
                currency: input.currency.toUpperCase(),
                active: input.active,
            })
            .returning();

        if (!plan) {
            throw new Error(
                "Unable to create boost plan.",
            );
        }

        await writeAuditRecord(tx, {
            actorUserId: input.adminUserId,
            action: "BOOST_PLAN_CREATED",
            entityType: "BOOST_PLAN",
            entityId: plan.id,
            metadata: {
                durationDays: plan.durationDays,
                price: plan.price,
                currency: plan.currency,
                active: plan.active,
            },
        });

        return plan;
    });
}

/**
 * Update an existing boost plan.
 */
export async function updateAdminBoostPlan(
    input: UpdateAdminBoostPlanInput,
) {
    return db.transaction(async (tx) => {
        const [existingPlan] = await tx
            .select()
            .from(boostPlans)
            .where(
                eq(boostPlans.id, input.planId),
            )
            .limit(1)
            .for("update");

        if (!existingPlan) {
            throw new Error(
                "Boost plan not found.",
            );
        }

        const updates: Partial<typeof boostPlans.$inferInsert> = {};

        if (input.durationDays !== undefined) {
            updates.durationDays = input.durationDays;
        }

        if (input.price !== undefined) {
            updates.price = input.price.toFixed(2);
        }

        if (input.currency !== undefined) {
            updates.currency = input.currency.toUpperCase();
        }

        if (input.active !== undefined) {
            updates.active = input.active;
        }

        const [updatedPlan] = await tx
            .update(boostPlans)
            .set(updates)
            .where(
                eq(boostPlans.id, input.planId),
            )
            .returning();

        if (!updatedPlan) {
            throw new Error(
                "Boost plan not found.",
            );
        }

        await writeAuditRecord(tx, {
            actorUserId: input.adminUserId,
            action: "BOOST_PLAN_UPDATED",
            entityType: "BOOST_PLAN",
            entityId: updatedPlan.id,
            metadata: {
                previous: {
                    durationDays: existingPlan.durationDays,
                    price: existingPlan.price,
                    currency: existingPlan.currency,
                    active: existingPlan.active,
                },
                updated: {
                    durationDays: updatedPlan.durationDays,
                    price: updatedPlan.price,
                    currency: updatedPlan.currency,
                    active: updatedPlan.active,
                },
            },
        });

        return updatedPlan;
    });
}

/**
 * Deactivate an existing boost plan.
 *
 * We intentionally do not physically delete the record
 * because existing listing boosts may reference it.
 */
export async function deactivateAdminBoostPlan(
    input: DeleteAdminBoostPlanInput,
) {
    return db.transaction(async (tx) => {
        const [existingPlan] = await tx
            .select()
            .from(boostPlans)
            .where(
                eq(boostPlans.id, input.planId),
            )
            .limit(1)
            .for("update");

        if (!existingPlan) {
            throw new Error(
                "Boost plan not found.",
            );
        }

        if (existingPlan.active === 0) {
            return existingPlan;
        }

        const [updatedPlan] = await tx
            .update(boostPlans)
            .set({
                active: 0,
            })
            .where(
                eq(boostPlans.id, input.planId),
            )
            .returning();

        if (!updatedPlan) {
            throw new Error(
                "Boost plan not found.",
            );
        }

        await writeAuditRecord(tx, {
            actorUserId: input.adminUserId,
            action: "BOOST_PLAN_DEACTIVATED",
            entityType: "BOOST_PLAN",
            entityId: updatedPlan.id,
            metadata: {
                durationDays: updatedPlan.durationDays,
                price: updatedPlan.price,
                currency: updatedPlan.currency,
                previousActive: existingPlan.active,
                newActive: 0,
            },
        });

        return updatedPlan;
    });
}