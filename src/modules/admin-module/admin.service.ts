import { db } from "../../database/index.ts";


import type {
    AuditExecutor,
    AuditInput,
} from "./admin.types.ts";
import { writeAuditRecord } from "../../helpers/audit/audit.service.ts";

/* =========================================================
AUDIT LOGGING
========================================================= */

/**

* Writes an audit record using the supplied database executor.
*
* Passing a transaction executor makes the audit record
* part of the caller's transaction.
  */
export async function writeAudit(
    executor: AuditExecutor,
    input: AuditInput,
): Promise<void> {
    await writeAuditRecord(executor, input);
}

/**

* Convenience helper for operations that do not already
* have a database transaction.
  */
export async function audit(
    input: AuditInput,
): Promise<void> {
    await writeAudit(db, input);
}