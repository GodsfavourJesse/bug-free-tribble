import {
    and,
    desc,
    eq,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";
import { auditLogs } from "../../../database/schema/index.ts";

const SETTINGS_UPDATE_ACTION = "COMMERCIAL_SETTINGS_UPDATED";
const SETTINGS_ENTITY_TYPE = "platform_settings";

export interface SettingsHistoryOptions {
    page?: number;
    limit?: number;
}

export async function getAdminSettingsHistory(
    options: SettingsHistoryOptions = {},
) {
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const limit = Math.min(
        100,
        Math.max(1, Math.floor(options.limit ?? 20)),
    );

    const offset = (page - 1) * limit;

    const conditions = and(
        eq(auditLogs.action, SETTINGS_UPDATE_ACTION),
        eq(auditLogs.entityType, SETTINGS_ENTITY_TYPE),
    );

    const [rows, countRows] = await Promise.all([
        db
            .select({
                id: auditLogs.id,
                actorUserId: auditLogs.actorUserId,
                action: auditLogs.action,
                entityType: auditLogs.entityType,
                entityId: auditLogs.entityId,
                ipAddress: auditLogs.ipAddress,
                userAgent: auditLogs.userAgent,
                metadata: auditLogs.metadata,
                createdAt: auditLogs.createdAt,
            })
            .from(auditLogs)
            .where(conditions)
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit)
            .offset(offset),

        db
            .select({
                total: sql<number>`count(*)::int`,
            })
            .from(auditLogs)
            .where(conditions),
    ]);

    const total = countRows[0]?.total ?? 0;

    return {
        items: rows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: offset + rows.length < total,
            hasPreviousPage: page > 1,
        },
    };
}