import {
    eq,
    inArray,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    dealerApplications,
    listingBoosts,
    listingImages,
    listingReports,
    listings,
    payments,
    refundRequests,
    subscriptions,
    users,
} from "../../../database/schema/index.ts";

/**
 * Convert PostgreSQL aggregate values into JavaScript numbers.
 *
 * PostgreSQL count() results can be returned as strings depending
 * on the driver and the expression used.
 */
function toNumber(value: unknown): number {
    const result = Number(value ?? 0);

    return Number.isFinite(result) ? result : 0;
}

/**
 * Returns aggregate operational KPIs for the admin dashboard.
 *
 * Revenue counts successful KARMASS payment records only.
 * It does not represent accounting profit or net revenue.
 *
 * The dashboard uses a small number of aggregate queries to
 * reduce database connection pressure.
 */
export async function getAdminDashboard() {
    const now = new Date();

    const monthStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
        0,
    );

    /*
     * Query 1: User statistics.
     */
    const userStatsPromise = db
        .select({
            total: sql<number>`count(*)::int`,

            active: sql<number>`
                count(*) FILTER (
                    WHERE ${users.status} = 'ACTIVE'
                )::int
            `,

            suspended: sql<number>`
                count(*) FILTER (
                    WHERE ${users.status} = 'SUSPENDED'
                )::int
            `,
        })
        .from(users);

    /*
     * Query 2: Listing statistics.
     */
    const listingStatsPromise = db
        .select({
            total: sql<number>`count(*)::int`,

            pending: sql<number>`
                count(*) FILTER (
                    WHERE ${listings.status} = 'PENDING_REVIEW'
                )::int
            `,

            approved: sql<number>`
                count(*) FILTER (
                    WHERE ${listings.status} = 'APPROVED'
                )::int
            `,

            rejected: sql<number>`
                count(*) FILTER (
                    WHERE ${listings.status} = 'REJECTED'
                )::int
            `,

            suspended: sql<number>`
                count(*) FILTER (
                    WHERE ${listings.status} = 'SUSPENDED'
                )::int
            `,
        })
        .from(listings);

    /*
     * Query 3: Dealer applications and subscriptions.
     */
    const operationsStatsPromise = Promise.all([
        db
            .select({
                pendingDealers: sql<number>`
                    count(*)::int
                `,
            })
            .from(dealerApplications)
            .where(eq(dealerApplications.status, "PENDING")),

        db
            .select({
                activeSubscriptions: sql<number>`
                    count(*)::int
                `,
            })
            .from(subscriptions)
            .where(eq(subscriptions.status, "ACTIVE")),
    ]);

    /*
     * Query 4: Boosts and image moderation.
     */
    const moderationStatsPromise = Promise.all([
        db
            .select({
                pendingBoosts: sql<number>`
                    count(*) FILTER (
                        WHERE ${listingBoosts.status} IN (
                            'PENDING',
                            'AWAITING_APPROVAL'
                        )
                    )::int
                `,

                activeBoosts: sql<number>`
                    count(*) FILTER (
                        WHERE ${listingBoosts.status} = 'ACTIVE'
                    )::int
                `,
            })
            .from(listingBoosts),

        db
            .select({
                pendingImages: sql<number>`
                    count(*)::int
                `,
            })
            .from(listingImages)
            .where(
                inArray(
                    listingImages.imageCheckStatus,
                    ["PENDING", "REVIEW"],
                ),
            ),

        db
            .select({
                pendingReports: sql<number>`
                    count(*)::int
                `,
            })
            .from(listingReports)
            .where(
                inArray(
                    listingReports.status,
                    ["PENDING", "REVIEWING"],
                ),
            ),
    ]);

    /*
     * Query 5: Payment aggregates.
     *
     * Grouping by currency prevents different currencies from
     * being incorrectly combined into a single revenue figure.
     */
    const paymentStatsPromise = db
        .select({
            currency: payments.currency,

            count: sql<number>`
                count(*)::int
            `,

            failedCount: sql<number>`
                count(*) FILTER (
                    WHERE ${payments.status}::text = 'FAILED'
                )::int
            `,

            successfulCount: sql<number>`
                count(*) FILTER (
                    WHERE ${payments.status}::text = 'SUCCESS'
                )::int
            `,

            grossRevenue: sql<string>`
                coalesce(
                    sum(${payments.amount}) FILTER (
                        WHERE ${payments.status}::text = 'SUCCESS'
                    ),
                    0
                )::text
            `,

            monthlyGrossRevenue: sql<string>`
                coalesce(
                    sum(${payments.amount}) FILTER (
                        WHERE ${payments.status}::text = 'SUCCESS'
                          AND ${payments.paidAt} >= ${monthStart}
                    ),
                    0
                )::text
            `,
        })
        .from(payments)
        .groupBy(payments.currency);

    /*
     * Query 6: Refund requests.
     */
    const refundStatsPromise = db
        .select({
            pendingOrProcessing: sql<number>`
                count(*)::int
            `,
        })
        .from(refundRequests)
        .where(
            inArray(
                refundRequests.status,
                ["PENDING", "APPROVED", "PROCESSING"],
            ),
        );

    /*
     * Run the six top-level database operations concurrently.
     */
    const [
        userRows,
        listingRows,
        operationsRows,
        moderationRows,
        paymentRows,
        refundRows,
    ] = await Promise.all([
        userStatsPromise,
        listingStatsPromise,
        operationsStatsPromise,
        moderationStatsPromise,
        paymentStatsPromise,
        refundStatsPromise,
    ]);

    const userStats = userRows[0];
    const listingStats = listingRows[0];

    const [dealerRows, subscriptionRows] = operationsRows;

    const [
        boostRows,
        imageRows,
        reportRows,
    ] = moderationRows;

    const dealerStats = dealerRows[0];
    const subscriptionStats = subscriptionRows[0];

    const boostStats = boostRows[0];
    const imageStats = imageRows[0];
    const reportStats = reportRows[0];

    const refundStats = refundRows[0];

    /*
     * Normalize aggregate values before building the response.
     */
    const totalUsers = toNumber(userStats?.total);
    const activeUsers = toNumber(userStats?.active);
    const suspendedUsers = toNumber(userStats?.suspended);

    const totalListings = toNumber(listingStats?.total);
    const pendingListings = toNumber(listingStats?.pending);
    const approvedListings = toNumber(listingStats?.approved);
    const rejectedListings = toNumber(listingStats?.rejected);
    const suspendedListings = toNumber(listingStats?.suspended);

    const pendingDealers = toNumber(
        dealerStats?.pendingDealers,
    );

    const activeSubscriptions = toNumber(
        subscriptionStats?.activeSubscriptions,
    );

    const pendingBoosts = toNumber(
        boostStats?.pendingBoosts,
    );

    const activeBoosts = toNumber(
        boostStats?.activeBoosts,
    );

    const pendingImageReviews = toNumber(
        imageStats?.pendingImages,
    );

    const pendingReports = toNumber(
        reportStats?.pendingReports,
    );

    const pendingRefunds = toNumber(
        refundStats?.pendingOrProcessing,
    );

    return {
        generatedAt: new Date().toISOString(),

        users: {
            total: totalUsers,
            active: activeUsers,
            suspended: suspendedUsers,
        },

        listings: {
            total: totalListings,
            pending: pendingListings,
            approved: approvedListings,
            rejected: rejectedListings,
            suspended: suspendedListings,
        },

        dealers: {
            pendingApplications: pendingDealers,
        },

        subscriptions: {
            active: activeSubscriptions,
        },

        revenue: {
            successfulPaymentCount: paymentRows.reduce(
                (total, row) =>
                    total + toNumber(row.successfulCount),
                0,
            ),

            grossSuccessfulPaymentsByCurrency: paymentRows
                .filter(
                    (row) =>
                        toNumber(row.successfulCount) > 0,
                )
                .map((row) => ({
                    currency: row.currency,
                    amount: toNumber(row.grossRevenue),
                })),

            grossSuccessfulPaymentsThisMonthByCurrency:
                paymentRows
                    .filter(
                        (row) =>
                            toNumber(row.monthlyGrossRevenue) > 0,
                    )
                    .map((row) => ({
                        currency: row.currency,
                        amount: toNumber(row.monthlyGrossRevenue),
                    })),

            note:
                "Gross successful payments before refunds, chargebacks, fees, and accounting adjustments. Amounts are not combined across currencies.",
        },

        payments: {
            total: paymentRows.reduce(
                (total, row) =>
                    total + toNumber(row.count),
                0,
            ),

            failed: paymentRows.reduce(
                (total, row) =>
                    total + toNumber(row.failedCount),
                0,
            ),
        },

        refunds: {
            pendingOrProcessing: pendingRefunds,
        },

        boosts: {
            pendingApproval: pendingBoosts,
            active: activeBoosts,
        },

        moderation: {
            pendingListings,
            pendingOrReviewImages: pendingImageReviews,
            pendingReports,
        },
    };
}

/**
 * Returns basic runtime and database health information.
 *
 * This endpoint should not expose database credentials,
 * connection strings, or other secrets.
 */
export async function getAdminSystemHealth() {
    const checkedAt = new Date().toISOString();

    let database: "healthy" | "unavailable" = "healthy";

    try {
        await db.execute(sql`SELECT 1`);
    } catch {
        database = "unavailable";
    }

    const memory = process.memoryUsage();

    return {
        status:
            database === "healthy"
                ? "healthy"
                : "degraded",

        checkedAt,

        uptimeSeconds: Math.floor(process.uptime()),

        environment:
            process.env.NODE_ENV ?? "development",

        database: {
            status: database,
        },

        runtime: {
            nodeVersion: process.version,

            memory: {
                rssBytes: memory.rss,
                heapUsedBytes: memory.heapUsed,
                heapTotalBytes: memory.heapTotal,
            },
        },
    };
}