import {
    and,
    eq,
    isNotNull,
    lte,
    sql,
} from "drizzle-orm";
import { db } from "../../../database/index.ts";
import { logger } from "../../../config/logger.ts";

/**
 * Maximum number of boosts processed in one batch.
 */
const BOOST_EXPIRY_BATCH_SIZE = 500;

/**
 * Expire boosts whose expiry time has passed.
 *
 * The status condition makes this operation safe to retry:
 * only ACTIVE boosts can transition to EXPIRED.
 *
 * Returns the number of boosts expired during this batch.
 */
export async function expireBoostsBatch(): Promise<number> {
    const expiredAt = new Date();

    const expiredBoosts = await db.execute(sql`
        WITH expired_candidates AS (
            SELECT id
            FROM listing_boosts
            WHERE status = 'ACTIVE'
              AND expires_at IS NOT NULL
              AND expires_at <= ${expiredAt}
            ORDER BY expires_at ASC
            LIMIT ${BOOST_EXPIRY_BATCH_SIZE}
            FOR UPDATE SKIP LOCKED
        )
        UPDATE listing_boosts AS boost
        SET status = 'EXPIRED'
        FROM expired_candidates AS candidate
        WHERE boost.id = candidate.id
          AND boost.status = 'ACTIVE'
        RETURNING boost.id
    `);

    const expiredCount = expiredBoosts.rows.length;

    if (expiredCount > 0) {
        logger.info(
            {
                expiredCount,
            },
            "Expired listing boosts",
        );
    }

    return expiredCount;
}

/**
 * Process all currently expired boosts in batches.
 *
 * The loop ends when no more eligible records are found.
 * If a batch fails, the error is propagated so the scheduler
 * can log it and retry on its next execution.
 */
export async function expireBoosts(): Promise<number> {
    let totalExpired = 0;

    while (true) {
        const expiredCount = await expireBoostsBatch();

        totalExpired += expiredCount;

        if (expiredCount < BOOST_EXPIRY_BATCH_SIZE) {
            break;
        }
    }

    return totalExpired;
}