import { auditLogs } from "../../database/schema/audit.ts";
import type { db } from "../../database/index.ts";
import { sanitizeAuditMetadata } from "./audit-sanitize.ts";

export interface AuditRecordInput {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: unknown;
}

export type AuditRecordExecutor = Pick<typeof db, "insert">;

/** Writes a sanitized audit event, optionally inside the caller's transaction. */
export async function writeAuditRecord(
    executor: AuditRecordExecutor,
    input: AuditRecordInput,
): Promise<void> {
    const metadata = sanitizeAuditMetadata(input.metadata);

    await executor.insert(auditLogs).values({
        ...(input.actorUserId !== undefined
            ? { actorUserId: input.actorUserId }
            : {}),
        action: input.action.slice(0, 120),
        entityType: input.entityType.slice(0, 80),
        ...(input.entityId !== undefined
            ? { entityId: input.entityId }
            : {}),
        ...(input.ipAddress !== undefined
            ? { ipAddress: input.ipAddress?.slice(0, 64) ?? null }
            : {}),
        ...(input.userAgent !== undefined
            ? { userAgent: input.userAgent?.slice(0, 500) ?? null }
            : {}),
        ...(metadata !== undefined
            ? { metadata }
            : {}),
    });
}
