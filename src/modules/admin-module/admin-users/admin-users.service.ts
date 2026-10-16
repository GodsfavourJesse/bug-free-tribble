import {
    and,
    desc,
    eq,
    ilike,
    inArray,
    or,
    sql,
} from "drizzle-orm";

import {
    db,
} from "../../../database/index.ts";

import {
    roles,
    userRoles,
    users,
    listings,
    subscriptions,
    payments,
    dealerApplications,
} from "../../../database/schema/index.ts";

import {
    AppError,
} from "../../../errors/app-error.ts";

import type {
    AdminUsersQuery,
} from "./admin-users.validation.ts";

const ADMIN_ROLE_NAMES = [
    "SUPER_ADMIN",
    "ADMIN",
    "SUPPORT",
] as const;

/**
 * Returns safe user fields for the admin dashboard.
 *
 * Password hashes and authentication secrets are never selected.
 */
const safeUserSelection = {
    id: users.id,
    email: users.email,
    firstName: users.firstName,
    lastName: users.lastName,
    phone: users.phone,
    avatarUrl: users.avatarUrl,
    accountType: users.accountType,
    status: users.status,
    emailVerified: users.emailVerified,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
};

/**
 * Builds the common filters used by the list and count queries.
 */
function buildUserFilters(
    query: AdminUsersQuery,
) {
    const conditions = [];

    if (query.status !== "ALL") {
        conditions.push(
            eq(users.status, query.status),
        );
    }

    if (query.type === "USER") {
        conditions.push(
            eq(users.accountType, "USER"),
        );
    }

    if (query.type === "DEALER") {
        conditions.push(
            eq(users.accountType, "DEALER"),
        );
    }

    if (query.search) {
        const searchPattern = `%${query.search}%`;

        conditions.push(
            or(
                ilike(users.firstName, searchPattern),
                ilike(users.lastName, searchPattern),
                ilike(users.email, searchPattern),
                ilike(users.phone, searchPattern),
            )!,
        );
    }

    return conditions;
}

/**
 * Lists users with filtering, searching and pagination.
 */
export async function listAdminUsers(
    query: AdminUsersQuery,
) {
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const filters = buildUserFilters(query);

    if (query.type === "ADMIN") {
        const adminConditions = [
            ...filters,
            inArray(
                roles.name,
                [...ADMIN_ROLE_NAMES],
            ),
        ];

        const rows = await db
            .selectDistinct(safeUserSelection)
            .from(users)
            .innerJoin(
                userRoles,
                eq(userRoles.userId, users.id),
            )
            .innerJoin(
                roles,
                eq(roles.id, userRoles.roleId),
            )
            .where(
                and(...adminConditions),
            )
            .orderBy(
                query.sort === "oldest"
                    ? users.createdAt
                    : desc(users.createdAt),
            )
            .limit(limit)
            .offset(offset);

        const countRows = await db
            .select({
                count: sql<number>`COUNT(DISTINCT ${users.id})`,
            })
            .from(users)
            .innerJoin(
                userRoles,
                eq(userRoles.userId, users.id),
            )
            .innerJoin(
                roles,
                eq(roles.id, userRoles.roleId),
            )
            .where(
                and(...adminConditions),
            );

        const total = Number(
            countRows[0]?.count ?? 0,
        );

        const usersWithRoles = await attachAdminRoles(
            rows,
        );

        return {
            items: usersWithRoles,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    const whereClause = filters.length > 0
        ? and(...filters)
        : undefined;

    const rows = await db
        .select(safeUserSelection)
        .from(users)
        .where(whereClause)
        .orderBy(
            query.sort === "oldest"
                ? users.createdAt
                : desc(users.createdAt),
        )
        .limit(limit)
        .offset(offset);

    const countRows = await db
        .select({
            count: sql<number>`COUNT(*)`,
        })
        .from(users)
        .where(whereClause);

    const total = Number(
        countRows[0]?.count ?? 0,
    );

    const items = await attachAdminRoles(rows);

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
 * Adds role names to returned user records.
 *
 * This also allows the frontend to display administrative roles
 * when viewing ALL accounts.
 */
async function attachAdminRoles<
    T extends { id: string },
>(
    userRows: T[],
) {
    if (userRows.length === 0) {
        return [];
    }

    const userIds = userRows.map(
        (user) => user.id,
    );

    const roleRows = await db
        .select({
            userId: userRoles.userId,
            roleName: roles.name,
        })
        .from(userRoles)
        .innerJoin(
            roles,
            eq(roles.id, userRoles.roleId),
        )
        .where(
            inArray(
                userRoles.userId,
                userIds,
            ),
        );

    const rolesByUser = new Map<string, string[]>();

    for (const row of roleRows) {
        const current = rolesByUser.get(row.userId) ?? [];

        current.push(row.roleName);

        rolesByUser.set(row.userId, current);
    }

    return userRows.map((user) => ({
        ...user,
        roles: [
            ...new Set(
                rolesByUser.get(user.id) ?? [],
            ),
        ],
    }));
}

/**
 * Retrieves one account by ID.
 */
export async function getAdminUserById(
    userId: string,
) {
    const rows = await db
        .select(safeUserSelection)
        .from(users)
        .where(
            eq(users.id, userId),
        )
        .limit(1);

    const user = rows[0];

    if (!user) {
        throw new AppError(
            "User account not found.",
            404,
            "USER_NOT_FOUND",
        );
    }

    const usersWithRoles = await attachAdminRoles([
        user,
    ]);

    const [
        recentListings,
        recentSubscriptions,
        recentPayments,
        dealerApplicationsForUser,
    ] = await Promise.all([
        db.select({
            id: listings.id,
            title: listings.title,
            status: listings.status,
            price: listings.price,
            currency: listings.currency,
            createdAt: listings.createdAt,
        })
            .from(listings)
            .where(eq(listings.sellerId, userId))
            .orderBy(desc(listings.createdAt))
            .limit(10),

        db.select({
            id: subscriptions.id,
            status: subscriptions.status,
            effectivePrice: subscriptions.effectivePrice,
            currency: subscriptions.currency,
            startsAt: subscriptions.startsAt,
            expiresAt: subscriptions.expiresAt,
            createdAt: subscriptions.createdAt,
        })
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .orderBy(desc(subscriptions.createdAt))
            .limit(10),

        db.select({
            id: payments.id,
            reference: payments.reference,
            purpose: payments.purpose,
            status: payments.status,
            amount: payments.amount,
            currency: payments.currency,
            paidAt: payments.paidAt,
            createdAt: payments.createdAt,
        })
            .from(payments)
            .where(eq(payments.userId, userId))
            .orderBy(desc(payments.createdAt))
            .limit(10),

        db.select({
            id: dealerApplications.id,
            companyName: dealerApplications.companyName,
            status: dealerApplications.status,
            createdAt: dealerApplications.createdAt,
            reviewedAt: dealerApplications.reviewedAt,
        })
            .from(dealerApplications)
            .where(eq(dealerApplications.userId, userId))
            .orderBy(desc(dealerApplications.createdAt))
            .limit(10),
    ]);

    return {
        ...usersWithRoles[0]!,
        related: {
            recentListings,
            recentSubscriptions,
            recentPayments,
            dealerApplications: dealerApplicationsForUser,
        },
    };
}

/**
 * Returns account totals for the admin dashboard.
 */
export async function getAdminUserStats() {
    const [
        totalRows,
        activeRows,
        suspendedRows,
        deletedRows,
        dealerRows,
    ] = await Promise.all([
        db
            .select({
                count: sql<number>`COUNT(*)`,
            })
            .from(users),

        db
            .select({
                count: sql<number>`COUNT(*)`,
            })
            .from(users)
            .where(
                eq(users.status, "ACTIVE"),
            ),

        db
            .select({
                count: sql<number>`COUNT(*)`,
            })
            .from(users)
            .where(
                eq(users.status, "SUSPENDED"),
            ),

        db
            .select({
                count: sql<number>`COUNT(*)`,
            })
            .from(users)
            .where(
                eq(users.status, "DELETED"),
            ),

        db
            .select({
                count: sql<number>`COUNT(*)`,
            })
            .from(users)
            .where(
                eq(users.accountType, "DEALER"),
            ),
    ]);

    const adminRows = await db
        .select({
            count: sql<number>`COUNT(DISTINCT ${users.id})`,
        })
        .from(users)
        .innerJoin(
            userRoles,
            eq(userRoles.userId, users.id),
        )
        .innerJoin(
            roles,
            eq(roles.id, userRoles.roleId),
        )
        .where(
            inArray(
                roles.name,
                [...ADMIN_ROLE_NAMES],
            ),
        );

    return {
        total: Number(totalRows[0]?.count ?? 0),
        active: Number(activeRows[0]?.count ?? 0),
        suspended: Number(suspendedRows[0]?.count ?? 0),
        deleted: Number(deletedRows[0]?.count ?? 0),
        dealers: Number(dealerRows[0]?.count ?? 0),
        administrators: Number(adminRows[0]?.count ?? 0),
    };
}