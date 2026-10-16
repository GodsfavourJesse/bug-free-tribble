import { describe, expect, it } from "vitest";

import { sanitizeAuditMetadata } from "../src/helpers/audit/audit-sanitize.ts";

describe("sanitizeAuditMetadata", () => {
    it("redacts credential and sensitive personal-data fields recursively", () => {
        const result = sanitizeAuditMetadata({
            action: "PASSWORD_CHANGED",
            password: "do-not-store",
            nested: {
                accessToken: "do-not-store-either",
                email: "person@example.com",
                count: 3,
            },
        });

        expect(result).toEqual({
            action: "PASSWORD_CHANGED",
            password: "[REDACTED]",
            nested: {
                accessToken: "[REDACTED]",
                email: "[REDACTED]",
                count: 3,
            },
        });
    });

    it("does not persist unstructured root strings", () => {
        expect(sanitizeAuditMetadata("possible-secret-value")).toEqual({
            value: "[REDACTED]",
        });
    });

    it("limits deeply nested values and very large arrays", () => {
        const nested = {
            a: {
                b: {
                    c: {
                        d: {
                            e: {
                                f: {
                                    g: {
                                        h: {
                                            i: "too deep",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
        const nestedResult = sanitizeAuditMetadata(nested);
        expect(JSON.stringify(nestedResult)).toContain("[OMITTED]");

        const arrayResult = sanitizeAuditMetadata(Array.from({ length: 105 }, (_, index) => index)) as unknown[];
        expect(arrayResult).toHaveLength(101);
        expect(arrayResult[100]).toBe("[5 ITEMS OMITTED]");
    });
});
