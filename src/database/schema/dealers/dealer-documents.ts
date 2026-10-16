import {
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import {
    dealerApplications,
} from "./dealer-applications.ts";

import {
    users,
} from "../users/users.ts";

export const dealerDocumentStatusEnum = pgEnum(
    "dealer_document_status",
    [
        "PENDING",
        "APPROVED",
        "REJECTED",
    ],
);

export const dealerDocuments = pgTable(
    "dealer_documents",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        applicationId: uuid("application_id")
            .notNull()
            .references(
                () => dealerApplications.id,
                {
                    onDelete: "cascade",
                },
            ),

        documentType: varchar("document_type", {
            length: 100,
        }).notNull(),

        /*
         * Private object-storage reference.
         * Never expose this through public APIs.
         */
        objectKey: varchar("object_key", {
            length: 500,
        }).notNull(),

        status: dealerDocumentStatusEnum("status")
            .notNull()
            .default("PENDING"),

        rejectionReason: text("rejection_reason"),

        reviewedByUserId: uuid("reviewed_by_user_id")
            .references(
                () => users.id,
                {
                    onDelete: "set null",
                },
            ),

        reviewedAt: timestamp("reviewed_at", {
            withTimezone: true,
        }),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
);