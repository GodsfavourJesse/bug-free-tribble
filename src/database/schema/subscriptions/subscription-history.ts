import {
    index,
    numeric,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import {
    subscriptionStatusEnum,
    subscriptions,
} from "./subscriptions.ts";

import { users } from "../users/users.ts";

/*
 * ============================================================
 * SUBSCRIPTION HISTORY EVENT
 * ============================================================
 *
 * Append-only lifecycle events for subscriptions.
 *
 * The subscription table tells us the CURRENT state.
 *
 * This table tells us WHAT HAPPENED.
 */

export const subscriptionHistoryEventEnum =
    pgEnum(
        "subscription_history_event",
        [
            "CREATED",
            "PAYMENT_PENDING",
            "PAYMENT_SUCCESS",
            "PAYMENT_FAILED",
            "ACTIVATED",
            "RENEWED",
            "CANCELLED",
            "EXPIRED",
            "REACTIVATED",
            "REFUNDED",
            "SUSPENDED",
            "RESUMED",
            "CREDIT_GRANTED",
            "CREDIT_REVOKED",
        ],
    );

/*
 * ============================================================
 * SUBSCRIPTION HISTORY
 * ============================================================
 *
 * Append-only lifecycle history.
 */

export const subscriptionHistory =
    pgTable(
        "subscription_history",
        {
            id: uuid(
                "id",
            )
                .defaultRandom()
                .primaryKey(),

            subscriptionId:
                uuid(
                    "subscription_id",
                )
                    .notNull()
                    .references(
                        () =>
                            subscriptions.id,
                        {
                            onDelete: "cascade",
                        },
                    ),

            userId: uuid(
                "user_id",
            )
                .notNull()
                .references(
                    () =>
                        users.id,
                    {
                        onDelete: "cascade",
                    },
                ),

            event:
                subscriptionHistoryEventEnum(
                    "event",
                ).notNull(),

            previousStatus:
                subscriptionStatusEnum(
                    "previous_status",
                ),

            newStatus:
                subscriptionStatusEnum(
                    "new_status",
                ),

            amount: numeric(
                "amount",
                {
                    precision: 14,
                    scale: 2,
                },
            ),

            currency: varchar(
                "currency",
                {
                    length: 10,
                },
            ),

            referenceId: uuid(
                "reference_id",
            ),

            reason: text(
                "reason",
            ),

            /*
             * JSON is intentionally stored as text for now.
             *
             * We can move this to jsonb if/when history metadata
             * becomes queryable.
             */

            metadata: text(
                "metadata",
            ),

            createdAt: timestamp(
                "created_at",
                {
                    withTimezone: true,
                },
            )
                .notNull()
                .defaultNow(),

            createdBy: uuid(
                "created_by",
            ).references(
                () =>
                    users.id,
                {
                    onDelete: "set null",
                },
            ),
        },
        (table) => ({
            subscriptionCreatedIdx:
                index(
                    "subscription_history_subscription_created_idx",
                ).on(
                    table.subscriptionId,
                    table.createdAt,
                ),

            userCreatedIdx:
                index(
                    "subscription_history_user_created_idx",
                ).on(
                    table.userId,
                    table.createdAt,
                ),

            eventIdx:
                index(
                    "subscription_history_event_idx",
                ).on(
                    table.event,
                ),

            referenceIdx:
                index(
                    "subscription_history_reference_idx",
                ).on(
                    table.referenceId,
                ),
        }),
    );