import {
    and,
    desc,
    eq,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    subscriptionPlans,
    subscriptionPlanVersions,
    subscriptions,
    users,
} from "../../../database/schema/index.ts";

import type {
    AuditInput,
} from "../admin.types.ts";
import { writeAuditRecord } from "../../../helpers/audit/audit.service.ts";

export interface CreatePlanInput {
    name: string;
    description?: string | null;
    price: string;
    currency: string;
    durationDays: number;
    listingCredits: number;
    dealerDiscountPercent: number;
}

export interface UpdatePlanInput {
    name?: string;
    description?: string | null;
    price?: string;
    currency?: string;
    durationDays?: number;
    listingCredits?: number;
    dealerDiscountPercent?: string | number;
    active?: boolean;
}

export class SubscriptionPlanError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
    ) {
        super(message);
        this.name = "SubscriptionPlanError";
    }
}

type PlanConfiguration = {
    price: string;
    currency: string;
    durationDays: number;
    listingCredits: number;
    dealerDiscountPercent: number;
};

async function writePlanAudit(
    executor: Pick<typeof db, "insert">,
    input: AuditInput,
): Promise<void> {
    await writeAuditRecord(executor, input);
}

function validatePlanConfiguration(
    input: PlanConfiguration,
): void {
    if (
        !/^\d+(?:\.\d{1,2})?$/.test(input.price) ||
        !Number.isFinite(Number(input.price)) ||
        Number(input.price) < 0
    ) {
        throw new SubscriptionPlanError(
            "Plan price must be non-negative with up to two decimal places.",
            400,
        );
    }

    if (
        !input.currency.trim() ||
        input.currency.trim().length < 3 ||
        input.currency.trim().length > 10
    ) {
        throw new SubscriptionPlanError(
            "A valid plan currency is required.",
            400,
        );
    }

    if (
        !Number.isSafeInteger(input.durationDays) ||
        input.durationDays <= 0
    ) {
        throw new SubscriptionPlanError(
            "Plan duration must be a positive whole number of days.",
            400,
        );
    }

    if (
        !Number.isSafeInteger(input.listingCredits) ||
        input.listingCredits <= 0
    ) {
        throw new SubscriptionPlanError(
            "Plan listing credits must be a positive whole number.",
            400,
        );
    }

    if (
        !Number.isFinite(input.dealerDiscountPercent) ||
        input.dealerDiscountPercent < 0 ||
        input.dealerDiscountPercent > 100
    ) {
        throw new SubscriptionPlanError(
            "Dealer discount must be between 0 and 100 percent.",
            400,
        );
    }
}

function normalizeConfiguration(
    input: PlanConfiguration,
): PlanConfiguration {
    return {
        price: input.price,
        currency: input.currency.trim().toUpperCase(),
        durationDays: input.durationDays,
        listingCredits: input.listingCredits,
        dealerDiscountPercent:
            input.dealerDiscountPercent,
    };
}

export async function listPlans() {
    const [plans, versions] = await Promise.all([
        db
            .select()
            .from(subscriptionPlans)
            .orderBy(desc(subscriptionPlans.createdAt)),

        db
            .select()
            .from(subscriptionPlanVersions)
            .orderBy(
                desc(subscriptionPlanVersions.version),
                desc(subscriptionPlanVersions.createdAt),
            ),
    ]);

    const versionsByPlan = new Map<
        string,
        typeof versions
    >();

    for (const version of versions) {
        const existing =
            versionsByPlan.get(version.planId) ?? [];

        existing.push(version);
        versionsByPlan.set(version.planId, existing);
    }

    return plans.map((plan) => {
        const planVersions =
            versionsByPlan.get(plan.id) ?? [];

        return {
            ...plan,
            latestVersion:
                planVersions[0] ?? null,
            versions: planVersions,
        };
    });
}

export async function createPlan(
    input: CreatePlanInput,
    actorUserId: string,
    auditMetadata?: {
        ipAddress?: string;
        userAgent?: string;
    },
) {
    const name = input.name.trim();

    if (name.length < 2 || name.length > 100) {
        throw new SubscriptionPlanError(
            "Plan name must contain between 2 and 100 characters.",
            400,
        );
    }

    const configuration = normalizeConfiguration({
        price: input.price,
        currency: input.currency,
        durationDays: input.durationDays,
        listingCredits: input.listingCredits,
        dealerDiscountPercent:
            input.dealerDiscountPercent,
    });

    validatePlanConfiguration(configuration);

    try {
        return await db.transaction(async (tx) => {
            const insertedPlans = await tx
                .insert(subscriptionPlans)
                .values({
                    name,
                    description:
                        input.description?.trim() || null,
                    active: true,
                    updatedAt: new Date(),
                })
                .returning();

            const plan = insertedPlans[0];

            if (!plan) {
                throw new SubscriptionPlanError(
                    "Unable to create subscription plan.",
                    500,
                );
            }

            const insertedVersions = await tx
                .insert(subscriptionPlanVersions)
                .values({
                    planId: plan.id,
                    version: 1,
                    price: configuration.price,
                    currency: configuration.currency,
                    durationDays:
                        configuration.durationDays,
                    listingCredits:
                        configuration.listingCredits,
                    dealerDiscountPercent:
                        configuration.dealerDiscountPercent
                            .toFixed(2),
                    active: true,
                    createdBy: actorUserId,
                })
                .returning();

            const version = insertedVersions[0];

            if (!version) {
                throw new SubscriptionPlanError(
                    "Unable to create the initial plan version.",
                    500,
                );
            }

            await writePlanAudit(tx, {
                actorUserId,
                action: "SUBSCRIPTION_PLAN_CREATED",
                entityType: "subscription_plan",
                entityId: plan.id,
                ...auditMetadata,
                metadata: {
                    name: plan.name,
                    version: version.version,
                    price: version.price,
                    currency: version.currency,
                    durationDays: version.durationDays,
                    listingCredits: version.listingCredits,
                    dealerDiscountPercent:
                        version.dealerDiscountPercent,
                },
            });

            return {
                ...plan,
                latestVersion: version,
                versions: [version],
            };
        });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
        ) {
            throw new SubscriptionPlanError(
                "A subscription plan with this name already exists.",
                409,
            );
        }

        throw error;
    }
}

export async function updatePlan(
    planId: string,
    input: UpdatePlanInput,
    actorUserId: string,
    auditMetadata?: {
        ipAddress?: string;
        userAgent?: string;
    },
) {
    if (!planId.trim()) {
        throw new SubscriptionPlanError(
            "Subscription plan ID is required.",
            400,
        );
    }

    return db.transaction(async (tx) => {
        const existingPlans = await tx
            .select()
            .from(subscriptionPlans)
            .where(eq(subscriptionPlans.id, planId))
            .for("update")
            .limit(1);

        const existingPlan = existingPlans[0];

        if (!existingPlan) {
            throw new SubscriptionPlanError(
                "Subscription plan not found.",
                404,
            );
        }

        const {
            name,
            description,
            active,
            price,
            currency,
            durationDays,
            listingCredits,
            dealerDiscountPercent,
        } = input;

        if (
            name !== undefined &&
            (name.trim().length < 2 ||
                name.trim().length > 100)
        ) {
            throw new SubscriptionPlanError(
                "Plan name must contain between 2 and 100 characters.",
                400,
            );
        }

        const hasIdentityChanges =
            name !== undefined ||
            description !== undefined ||
            active !== undefined;

        if (hasIdentityChanges) {
            await tx
                .update(subscriptionPlans)
                .set({
                    ...(name !== undefined
                        ? { name: name.trim() }
                        : {}),
                    ...(description !== undefined
                        ? {
                            description:
                                description?.trim() || null,
                        }
                        : {}),
                    ...(active !== undefined
                        ? { active }
                        : {}),
                    updatedAt: new Date(),
                })
                .where(
                    eq(subscriptionPlans.id, planId),
                );
        }

        const versionRows = await tx
            .select()
            .from(subscriptionPlanVersions)
            .where(
                eq(
                    subscriptionPlanVersions.planId,
                    planId,
                ),
            )
            .orderBy(
                desc(subscriptionPlanVersions.version),
            )
            .limit(1);

        const previousVersion = versionRows[0];

        if (!previousVersion) {
            throw new SubscriptionPlanError(
                "The subscription plan has no pricing version.",
                409,
            );
        }

        const hasVersionChanges =
            price !== undefined ||
            currency !== undefined ||
            durationDays !== undefined ||
            listingCredits !== undefined ||
            dealerDiscountPercent !== undefined;

        let latestVersion = previousVersion;

        if (hasVersionChanges) {
            const nextConfiguration =
                normalizeConfiguration({
                    price:
                        price ?? previousVersion.price,
                    currency:
                        currency ?? previousVersion.currency,
                    durationDays:
                        durationDays ??
                        previousVersion.durationDays,
                    listingCredits:
                        listingCredits ??
                        previousVersion.listingCredits,
                    dealerDiscountPercent:
                        dealerDiscountPercent !== undefined
                            ? Number(dealerDiscountPercent)
                            : Number(
                                previousVersion
                                    .dealerDiscountPercent,
                            ),
                });

            validatePlanConfiguration(
                nextConfiguration,
            );

            /*
             * Keep historical versions unchanged.
             *
             * Only the active flag is changed to prevent
             * the old version from being selected for new
             * purchases.
             */
            await tx
                .update(subscriptionPlanVersions)
                .set({ active: false })
                .where(
                    and(
                        eq(
                            subscriptionPlanVersions.planId,
                            planId,
                        ),
                        eq(
                            subscriptionPlanVersions.active,
                            true,
                        ),
                    ),
                );

            const insertedVersions = await tx
                .insert(subscriptionPlanVersions)
                .values({
                    planId,
                    version:
                        previousVersion.version + 1,
                    price: nextConfiguration.price,
                    currency:
                        nextConfiguration.currency,
                    durationDays:
                        nextConfiguration.durationDays,
                    listingCredits:
                        nextConfiguration.listingCredits,
                    dealerDiscountPercent:
                        nextConfiguration
                            .dealerDiscountPercent
                            .toFixed(2),
                    active: true,
                    createdBy: actorUserId,
                })
                .returning();

            const createdVersion =
                insertedVersions[0];

            if (!createdVersion) {
                throw new SubscriptionPlanError(
                    "Unable to create the new plan version.",
                    500,
                );
            }

            latestVersion = createdVersion;
        }

        await writePlanAudit(tx, {
            actorUserId,
            action:
                active === false
                    ? "SUBSCRIPTION_PLAN_DEACTIVATED"
                    : active === true
                        ? "SUBSCRIPTION_PLAN_ACTIVATED"
                        : hasVersionChanges
                            ? "SUBSCRIPTION_PLAN_VERSION_CREATED"
                            : "SUBSCRIPTION_PLAN_UPDATED",
            entityType: "subscription_plan",
            entityId: planId,
            ...auditMetadata,
            metadata: {
                previousName: existingPlan.name,
                newName:
                    name ?? existingPlan.name,
                previousActive: existingPlan.active,
                newActive:
                    active ?? existingPlan.active,
                previousVersion:
                    previousVersion.version,
                currentVersion:
                    latestVersion.version,
                versionCreated: hasVersionChanges,
                configurationChanged:
                    hasVersionChanges,
            },
        });

        const updatedPlans = await tx
            .select()
            .from(subscriptionPlans)
            .where(
                eq(subscriptionPlans.id, planId),
            )
            .limit(1);

        const updatedPlan = updatedPlans[0];

        if (!updatedPlan) {
            throw new SubscriptionPlanError(
                "Subscription plan not found after update.",
                404,
            );
        }

        return {
            ...updatedPlan,
            latestVersion,
        };
    });
}

export async function listAdminSubscriptions(input: {
    page: number;
    limit: number;
    status?: "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED";
}) {
    const where = input.status
        ? eq(subscriptions.status, input.status)
        : undefined;
    const offset = (input.page - 1) * input.limit;

    const [items, countRows] = await Promise.all([
        db.select({
            subscription: subscriptions,
            customer: {
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
                accountType: users.accountType,
                status: users.status,
            },
            plan: {
                id: subscriptionPlans.id,
                name: subscriptionPlans.name,
            },
        })
            .from(subscriptions)
            .innerJoin(users, eq(users.id, subscriptions.userId))
            .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
            .where(where)
            .orderBy(desc(subscriptions.createdAt))
            .limit(input.limit)
            .offset(offset),
        db.select({
            count: sql<number>`count(*)::int`,
        })
            .from(subscriptions)
            .where(where),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return {
        items,
        pagination: {
            page: input.page,
            limit: input.limit,
            total,
            totalPages: Math.ceil(total / input.limit),
        },
    };
}
