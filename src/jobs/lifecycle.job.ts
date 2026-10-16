import {
    and,
    eq,
    lte,
} from "drizzle-orm";

import { db } from "../database/index.ts";

import {
    listingBoosts,
    listings,
    subscriptions,
} from "../database/schema/index.ts";

import {
    createNotification,
} from "../modules/notification-module/notification.service.ts";

import {
    transitionListing,
} from "../modules/listing-module/listings/listing.lifecycle.ts";

let timer: NodeJS.Timeout | null = null;

async function expireSubscriptions(
    now: Date,
): Promise<void> {
    const expiredSubscriptions =
        await db
            .select({
                id: subscriptions.id,
                userId:
                    subscriptions.userId,
            })
            .from(subscriptions)
            .where(
                and(
                    eq(
                        subscriptions.status,
                        "ACTIVE",
                    ),
                    lte(
                        subscriptions.expiresAt,
                        now,
                    ),
                ),
            );

    if (
        expiredSubscriptions.length === 0
    ) {
        return;
    }

    await db
        .update(subscriptions)
        .set({
            status: "EXPIRED",
            updatedAt: now,
        })
        .where(
            and(
                eq(
                    subscriptions.status,
                    "ACTIVE",
                ),
                lte(
                    subscriptions.expiresAt,
                    now,
                ),
            ),
        );

    await Promise.all(
        expiredSubscriptions.map(
            (subscription) =>
                createNotification({
                    userId:
                        subscription.userId,
                    type:
                        "SUBSCRIPTION_EXPIRED",
                    title:
                        "Subscription expired",
                    message:
                        "Your KARMASS subscription has expired. Renew to continue adding paid listing credits.",
                    data: {
                        subscriptionId:
                            subscription.id,
                    },
                }),
        ),
    );
}

async function expireListings(
    now: Date,
): Promise<void> {
    const expiredListings =
        await db
            .select({
                id: listings.id,
            })
            .from(listings)
            .where(
                and(
                    eq(
                        listings.status,
                        "APPROVED",
                    ),
                    lte(
                        listings.expiresAt,
                        now,
                    ),
                ),
            );

    for (
        const listing
        of expiredListings
    ) {
        try {
            const result =
                await transitionListing({
                    listingId:
                        listing.id,
                    action:
                        "EXPIRE",
                    actorId: null,
                });

            await createNotification({
                userId:
                    result.listing
                        .sellerId,
                type:
                    "LISTING_EXPIRED",
                title:
                    "Listing expired",
                message:
                    "Your KARMASS listing is no longer visible in the marketplace.",
                data: {
                    listingId:
                        listing.id,
                },
            });
        } catch (error) {
            console.error(
                "Failed to expire listing.",
                {
                    listingId:
                        listing.id,
                    error,
                },
            );
        }
    }
}

async function expireBoosts(
    now: Date,
): Promise<void> {
    await db
        .update(listingBoosts)
        .set({
            status: "EXPIRED",
        })
        .where(
            and(
                eq(
                    listingBoosts.status,
                    "ACTIVE",
                ),
                lte(
                    listingBoosts.expiresAt,
                    now,
                ),
            ),
        );
}

async function expireLifecycleRecords(): Promise<void> {
    const now = new Date();

    await expireSubscriptions(now);

    await expireListings(now);

    await expireBoosts(now);
}

export function startLifecycleJob(): void {
    void expireLifecycleRecords();

    timer = setInterval(
        () => {
            void expireLifecycleRecords();
        },
        5 * 60 * 1000,
    );

    timer.unref();
}

export function stopLifecycleJob(): void {
    if (!timer) {
        return;
    }

    clearInterval(timer);
    timer = null;
}