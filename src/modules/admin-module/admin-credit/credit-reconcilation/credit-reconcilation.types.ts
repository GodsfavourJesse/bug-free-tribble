export interface CreditReconciliationIssue {
    code:
        | "NEGATIVE_BALANCE"
        | "MISSING_REFERENCE"
        | "DUPLICATE_REFERENCE"
        | "MISSING_ADMIN_AUDIT";

    severity: "WARNING" | "ERROR";
    description: string;
    affectedRecords: number;
    examples: Array<Record<string, unknown>>;
}

export interface CreditReconciliationResult {
    checkedAt: string;
    status: "HEALTHY" | "ISSUES_FOUND";
    issuesFound: number;
    issues: CreditReconciliationIssue[];
}


export interface NegativeBalanceRow extends Record<string, unknown> {
    user_id: string;
    balance: number;
}

export interface MissingReferenceRow extends Record<string, unknown> {
    id: string;
    user_id: string;
    reason: string;
    amount: number;
    created_at: Date | string;
}

export interface DuplicateReferenceRow extends Record<string, unknown> {
    user_id: string;
    reason: string;
    reference_id: string;
    entry_count: number;
}

export interface MissingAdminAuditRow extends Record<string, unknown> {
    id: string;
    user_id: string;
    amount: number;
    reference_id: string;
    created_at: Date | string;
}