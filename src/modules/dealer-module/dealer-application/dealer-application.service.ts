import { desc, eq } from "drizzle-orm";
import { db } from "../../../database/index.ts";
import { dealerApplications } from "../../../database/schema/index.ts";


export async function getMyDealerApplications(userId: string) {
    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
        throw new Error("Authenticated user ID is required.");
    }

    const applications = await db
        .select({
            id: dealerApplications.id,
            companyName: dealerApplications.companyName,
            status: dealerApplications.status,
            rejectionReason: dealerApplications.rejectionReason,
            submittedAt: dealerApplications.createdAt,
            reviewedAt: dealerApplications.reviewedAt,
            updatedAt: dealerApplications.updatedAt,
        })
        .from(dealerApplications)
        .where(eq(dealerApplications.userId, normalizedUserId))
        .orderBy(desc(dealerApplications.createdAt));

    return applications;
}