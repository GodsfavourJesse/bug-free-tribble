import { db } from "../../../database/index.ts";
import { writeAuditRecord } from "../../../helpers/audit/audit.service.ts";

export async function writeAuditLog(
    userId: string,
    action: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    await writeAuditRecord(db, {
        actorUserId: userId,
        action,
        entityType: "user",
        entityId: userId,
        ...(metadata !== undefined ? { metadata } : {}),
    });
}
