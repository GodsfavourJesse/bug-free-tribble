import type { db } from "../../database/index.ts";

export interface AuditInput {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: unknown;
}

/**

* Supports both the database connection and transaction
* executors when writing audit records.
  */
export type AuditExecutor = Pick<typeof db, "insert">;
