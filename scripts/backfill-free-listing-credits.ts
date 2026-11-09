import { eq } from "drizzle-orm";

import { db, closeDatabase } from "../src/database/index.ts";

import {
    users,
    roles,
    userRoles,
    listingCreditLedger,
} from "../src/database/schema/index.ts";

import {
    CREDIT_REASONS,
    grantCredits,
} from "../src/modules/credits/credit.service.ts";

import {
    getNumberSetting,
} from "../src/helpers/auth/auth.settings.ts";

async function backfillFreeListingCredits() {
    const freeCredits = await getNumberSetting(
        "free_listing_credits",
    );

    if (
        !Number.isSafeInteger(freeCredits) ||
        freeCredits <= 0
    ) {
        throw new Error(
            `Invalid free_listing_credits setting: ${freeCredits}`,
        );
    }

    console.log(
        `Starting free-credit backfill. Allowance: ${freeCredits}`,
    );

    const customers = await db
        .select({
            id: users.id,
        })
        .from(users)
        .innerJoin(
            userRoles,
            eq(userRoles.userId, users.id),
        )
        .innerJoin(
            roles,
            eq(roles.id, userRoles.roleId),
        )
        .where(
            eq(roles.name, "CUSTOMER"),
        );

    const existingGrants = await db
        .select({
            userId: listingCreditLedger.userId,
        })
        .from(listingCreditLedger)
        .where(
            eq(
                listingCreditLedger.reason,
                CREDIT_REASONS.FREE_TRIAL,
            ),
        );

    const alreadyGranted = new Set(
        existingGrants.map((entry) => entry.userId),
    );

    const eligibleCustomers = customers.filter(
        (customer) => !alreadyGranted.has(customer.id),
    );

    console.log(`Customers found: ${customers.length}`);
    console.log(`Already received credits: ${alreadyGranted.size}`);
    console.log(`Customers to receive credits: ${eligibleCustomers.length}`);

    let granted = 0;

    await db.transaction(async (tx) => {
        for (const customer of eligibleCustomers) {
            const result = await grantCredits(
                {
                    userId: customer.id,
                    amount: freeCredits,
                    reason: CREDIT_REASONS.FREE_TRIAL,
                    referenceId: customer.id,
                },
                tx,
            );

            if (result.inserted) {
                granted++;
            }
        }
    });

    console.log("--------------------------------");
    console.log("Free-credit backfill completed.");
    console.log(`Successfully granted credits: ${granted}`);
    console.log("--------------------------------");
}

try {
    await backfillFreeListingCredits();
} catch (error) {
    console.error(
        "Free-credit backfill failed:",
        error,
    );

    process.exitCode = 1;
} finally {
    await closeDatabase();
}