import { sql } from "drizzle-orm";

import { db } from "../../../../database/index.ts";
import { CreditReconciliationIssue, CreditReconciliationResult, DuplicateReferenceRow, MissingAdminAuditRow, MissingReferenceRow, NegativeBalanceRow } from "./credit-reconcilation.types.ts";


/**
 * Runs read-only integrity checks against the listing-credit ledger.
 *
 * This function does not repair, update, or delete any records.
 */
export async function reconcileListingCredits(): Promise<CreditReconciliationResult> {
    const issues: CreditReconciliationIssue[] = [];

    /*
     * CHECK 1:
     * Find users whose total ledger balance is negative.
     */
    const negativeBalanceResult = await db.execute<NegativeBalanceRow>(
        sql`
            SELECT
                user_id::text AS user_id,
                SUM(amount)::int AS balance
            FROM listing_credit_ledger
            GROUP BY user_id
            HAVING SUM(amount) < 0
            ORDER BY SUM(amount) ASC
            LIMIT 100
        `,
    );

    const negativeBalanceRows = negativeBalanceResult.rows;

    if (negativeBalanceRows.length > 0) {
        issues.push({
            code: "NEGATIVE_BALANCE",
            severity: "ERROR",
            description:
                "One or more users have a negative listing-credit balance.",
            affectedRecords: negativeBalanceRows.length,
            examples: negativeBalanceRows.map((row) => ({
                userId: row.user_id,
                balance: Number(row.balance),
            })),
        });
    }

    /*
     * CHECK 2:
     * Find ledger entries without transaction references.
     *
     * The current credit service requires a reference ID for
     * grants and consumption. A missing reference should therefore
     * be investigated.
     */
    const missingReferenceResult =
        await db.execute<MissingReferenceRow>(
            sql`
                SELECT
                    id::text AS id,
                    user_id::text AS user_id,
                    reason,
                    amount,
                    created_at
                FROM listing_credit_ledger
                WHERE reference_id IS NULL
                ORDER BY created_at DESC
                LIMIT 100
            `,
        );

    const missingReferenceRows = missingReferenceResult.rows;

    if (missingReferenceRows.length > 0) {
        issues.push({
            code: "MISSING_REFERENCE",
            severity: "WARNING",
            description:
                "Some ledger entries have no transaction reference ID.",
            affectedRecords: missingReferenceRows.length,
            examples: missingReferenceRows.map((row) => ({
                ledgerEntryId: row.id,
                userId: row.user_id,
                reason: row.reason,
                amount: Number(row.amount),
                createdAt: row.created_at,
            })),
        });
    }

    /*
     * CHECK 3:
     * Find duplicate transaction references.
     *
     * The unique index should prevent duplicates for non-null
     * references. This check verifies that the invariant holds.
     */
    const duplicateReferenceResult =
        await db.execute<DuplicateReferenceRow>(
            sql`
                SELECT
                    user_id::text AS user_id,
                    reason,
                    reference_id::text AS reference_id,
                    COUNT(*)::int AS entry_count
                FROM listing_credit_ledger
                WHERE reference_id IS NOT NULL
                GROUP BY
                    user_id,
                    reason,
                    reference_id
                HAVING COUNT(*) > 1
                ORDER BY COUNT(*) DESC
                LIMIT 100
            `,
        );

    const duplicateReferenceRows =
        duplicateReferenceResult.rows;

    if (duplicateReferenceRows.length > 0) {
        issues.push({
            code: "DUPLICATE_REFERENCE",
            severity: "ERROR",
            description:
                "Duplicate credit transaction references were found.",
            affectedRecords: duplicateReferenceRows.length,
            examples: duplicateReferenceRows.map((row) => ({
                userId: row.user_id,
                reason: row.reason,
                referenceId: row.reference_id,
                entryCount: Number(row.entry_count),
            })),
        });
    }

    /*
     * CHECK 4:
     * Find administrative adjustment ledger entries without
     * a corresponding audit log.
     *
     * The admin adjustment service records:
     * action = LISTING_CREDITS_ADJUSTED
     * metadata.ledgerEntryId = the inserted ledger entry ID
     */
    const missingAdminAuditResult =
        await db.execute<MissingAdminAuditRow>(
            sql`
                SELECT
                    ledger.id::text AS id,
                    ledger.user_id::text AS user_id,
                    ledger.amount,
                    ledger.reference_id::text AS reference_id,
                    ledger.created_at
                FROM listing_credit_ledger AS ledger
                WHERE ledger.reason = 'ADMIN_ADJUSTMENT'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM audit_logs AS audit
                      WHERE audit.action = 'LISTING_CREDITS_ADJUSTED'
                        AND audit.metadata ->> 'ledgerEntryId'
                            = ledger.id::text
                  )
                ORDER BY ledger.created_at DESC
                LIMIT 100
            `,
        );

    const missingAdminAuditRows =
        missingAdminAuditResult.rows;

    if (missingAdminAuditRows.length > 0) {
        issues.push({
            code: "MISSING_ADMIN_AUDIT",
            severity: "ERROR",
            description:
                "Administrative credit adjustments without matching audit records were found.",
            affectedRecords: missingAdminAuditRows.length,
            examples: missingAdminAuditRows.map((row) => ({
                ledgerEntryId: row.id,
                userId: row.user_id,
                amount: Number(row.amount),
                referenceId: row.reference_id,
                createdAt: row.created_at,
            })),
        });
    }

    const hasErrors = issues.some(
        (issue) => issue.severity === "ERROR",
    );

    return {
        checkedAt: new Date().toISOString(),
        status: issues.length === 0 ? "HEALTHY" : "ISSUES_FOUND",
        issuesFound: issues.length,
        issues,
    };
}