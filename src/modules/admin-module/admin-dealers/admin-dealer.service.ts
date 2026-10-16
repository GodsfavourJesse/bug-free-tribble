import {
    and,
    desc,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    dealerApplications,
    dealerDocuments,
    dealerProfiles,
    users,
} from "../../../database/schema/index.ts";

import { createNotification } from "../../notification-module/notification.service.ts";

import { writeAudit } from "../admin.service.ts";

/* =========================================================
   DEALER APPLICATIONS
========================================================= */

/**
 * Lists dealer applications for administrative review.
 *
 * When a status is supplied, only applications with that
 * status are returned.
 *
 * Each result includes:
 * - Application information
 * - Applicant information
 * - Associated dealer documents
 *
 * Note:
 * Applications with multiple documents produce multiple
 * result rows because the query uses a left join.
 */
export async function listDealerApplications(
    status?: "PENDING" | "APPROVED" | "REJECTED",
) {
    return db
        .select({
            application: dealerApplications,

            user: {
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
            },

            documents: dealerDocuments,
        })
        .from(dealerApplications)
        .innerJoin(
            users,
            eq(
                users.id,
                dealerApplications.userId,
            ),
        )
        .leftJoin(
            dealerDocuments,
            eq(
                dealerDocuments.applicationId,
                dealerApplications.id,
            ),
        )
        .where(
            status !== undefined
                ? eq(
                      dealerApplications.status,
                      status,
                  )
                : undefined,
        )
        .orderBy(
            desc(
                dealerApplications.createdAt,
            ),
        );
}

/* =========================================================
   REVIEW DEALER APPLICATION
========================================================= */

/**
 * Approves or rejects a dealer application.
 *
 * Approval requirements:
 * - The application must exist.
 * - The application must still be pending.
 * - At least one verification document must exist.
 * - Every submitted document must already be approved.
 *
 * Approval also:
 * - Records the reviewer and review timestamp.
 * - Creates or updates the dealer profile.
 * - Marks the profile as verified.
 * - Upgrades the user's account type to DEALER.
 *
 * Rejection requirements:
 * - A non-empty rejection reason must be provided.
 *
 * After the database transaction commits:
 * - An audit record is created.
 * - The applicant is notified.
 */
export async function reviewDealer(
    applicationId: string,
    reviewerId: string,
    decision: "APPROVED" | "REJECTED",
    rejectionReason?: string,
) {
    const normalizedApplicationId = applicationId.trim();
    const normalizedReviewerId = reviewerId.trim();
    const normalizedRejectionReason =
        rejectionReason?.trim() ?? "";

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(normalizedApplicationId)) {
        throw new Error("Invalid dealer application ID.");
    }

    if (!uuidRegex.test(normalizedReviewerId)) {
        throw new Error("Invalid reviewer ID.");
    }

    if (
        decision !== "APPROVED" &&
        decision !== "REJECTED"
    ) {
        throw new Error("Invalid dealer application decision.");
    }

    if (
        decision === "REJECTED" &&
        !normalizedRejectionReason
    ) {
        throw new Error(
            "A rejection reason is required.",
        );
    }

    if (normalizedRejectionReason.length > 5000) {
        throw new Error(
            "The rejection reason cannot exceed 5000 characters.",
        );
    }

    const result = await db.transaction(async (tx) => {
        /*
         * Lock the application first.
         * This serializes concurrent administrative reviews
         * and coordinates with the document workflows.
         */
        const [application] = await tx
            .select()
            .from(dealerApplications)
            .where(
                eq(
                    dealerApplications.id,
                    normalizedApplicationId,
                ),
            )
            .for("update")
            .limit(1);

        if (!application) {
            throw new Error(
                "Dealer application not found.",
            );
        }

        if (application.status !== "PENDING") {
            throw new Error(
                "Only pending dealer applications can be reviewed.",
            );
        }

        /*
         * Lock and validate the applicant.
         */
        const [applicant] = await tx
            .select({
                id: users.id,
                accountType: users.accountType,
            })
            .from(users)
            .where(
                eq(
                    users.id,
                    application.userId,
                ),
            )
            .for("update")
            .limit(1);

        if (!applicant) {
            throw new Error(
                "Applicant account was not found.",
            );
        }

        if (decision === "APPROVED") {
            /*
             * Lock all submitted documents before checking
             * their review statuses.
             */
            const documentRows = await tx
                .select({
                    id: dealerDocuments.id,
                    status: dealerDocuments.status,
                })
                .from(dealerDocuments)
                .where(
                    eq(
                        dealerDocuments.applicationId,
                        application.id,
                    ),
                )
                .for("update");

            if (documentRows.length === 0) {
                throw new Error(
                    "At least one verification document is required before approval.",
                );
            }

            if (
                documentRows.some(
                    (document) =>
                        document.status !== "APPROVED",
                )
            ) {
                throw new Error(
                    "Every submitted verification document must be approved first.",
                );
            }

            /*
             * An existing dealer account must not be silently
             * re-verified through a second application.
             */
            if (applicant.accountType === "DEALER") {
                const [existingProfile] = await tx
                    .select({
                        id: dealerProfiles.id,
                        verified: dealerProfiles.verified,
                    })
                    .from(dealerProfiles)
                    .where(
                        eq(
                            dealerProfiles.userId,
                            applicant.id,
                        ),
                    )
                    .limit(1);

                if (
                    !existingProfile ||
                    !existingProfile.verified
                ) {
                    throw new Error(
                        "This account is already classified as a dealer but does not have a valid verified dealer profile. Resolve the account inconsistency before approving another application.",
                    );
                }

                throw new Error(
                    "This user is already a dealer. A second dealer application cannot be approved.",
                );
            }

            /*
             * Do not overwrite an existing profile belonging
             * to an unexpected account state.
             */
            const [existingProfile] = await tx
                .select({
                    id: dealerProfiles.id,
                    verified: dealerProfiles.verified,
                })
                .from(dealerProfiles)
                .where(
                    eq(
                        dealerProfiles.userId,
                        applicant.id,
                    ),
                )
                .limit(1);

            if (existingProfile) {
                throw new Error(
                    "A dealer profile already exists for this applicant. Resolve the existing profile before approving this application.",
                );
            }
        }

        const now = new Date();

        /*
         * Update the application review decision.
         */
        const [updatedApplication] = await tx
            .update(dealerApplications)
            .set({
                status: decision,
                rejectionReason:
                    decision === "REJECTED"
                        ? normalizedRejectionReason
                        : null,
                reviewedByUserId: normalizedReviewerId,
                reviewedAt: now,
                updatedAt: now,
            })
            .where(
                eq(
                    dealerApplications.id,
                    application.id,
                ),
            )
            .returning();

        if (!updatedApplication) {
            throw new Error(
                "Failed to update dealer application.",
            );
        }

        if (decision === "APPROVED") {
            /*
             * Create the verified dealer profile.
             * No conflict-update is used: an unexpected
             * existing profile must not be overwritten.
             */
            const [createdProfile] = await tx
                .insert(dealerProfiles)
                .values({
                    userId: applicant.id,
                    companyName: application.companyName,
                    verified: true,
                    verifiedAt: now,
                })
                .returning({
                    id: dealerProfiles.id,
                });

            if (!createdProfile) {
                throw new Error(
                    "Failed to create the verified dealer profile.",
                );
            }

            /*
             * Upgrade the user's account type.
             */
            const [updatedUser] = await tx
                .update(users)
                .set({
                    accountType: "DEALER",
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(users.id, applicant.id),
                        eq(users.accountType, "USER"),
                    ),
                )
                .returning({
                    id: users.id,
                });

            if (!updatedUser) {
                throw new Error(
                    "The applicant account could not be upgraded. Its account type may have changed.",
                );
            }
        }

        /*
         * Audit logging is transactional.
         * An audit failure rolls back the approval or rejection.
         */
        await writeAudit(tx, {
            actorUserId: normalizedReviewerId,
            action: `DEALER_${decision}`,
            entityType: "dealer_application",
            entityId: updatedApplication.id,
            metadata: {
                userId: updatedApplication.userId,
                companyName: updatedApplication.companyName,
                rejectionReason:
                    decision === "REJECTED"
                        ? normalizedRejectionReason
                        : null,
            },
        });

        return updatedApplication;
    });

    /*
     * Notify only after the transaction commits.
     */
    await createNotification({
        userId: result.userId,
        type:
            decision === "APPROVED"
                ? "DEALER_VERIFIED"
                : "DEALER_APPLICATION_REJECTED",
        title:
            decision === "APPROVED"
                ? "Dealer application approved"
                : "Dealer application rejected",
        message:
            decision === "APPROVED"
                ? "Your dealer application has been approved. Your account is now upgraded to dealer status."
                : `Your dealer application was rejected. Reason: ${normalizedRejectionReason}`,
        data: {
            applicationId: result.id,
            status: decision,
        },
    });

    return result;
}

/* =========================================================
   REVIEW DEALER DOCUMENT
========================================================= */

/**
 * Approves or rejects an individual dealer verification
 * document.
 *
 * Only documents belonging to pending applications can
 * be reviewed.
 *
 * A document can only be reviewed once while pending.
 *
 * The private storage object key is never returned.
 */
export async function reviewDealerDocument(
    documentId: string,
    reviewerId: string,
    decision: "APPROVED" | "REJECTED",
    rejectionReason?: string,
) {
    const normalizedDocumentId = documentId.trim();
    const normalizedReviewerId = reviewerId.trim();
    const normalizedRejectionReason =
        rejectionReason?.trim() ?? "";

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(normalizedDocumentId)) {
        throw new Error("Invalid dealer document ID.");
    }

    if (!uuidRegex.test(normalizedReviewerId)) {
        throw new Error("Invalid reviewer ID.");
    }

    if (
        decision !== "APPROVED" &&
        decision !== "REJECTED"
    ) {
        throw new Error("Invalid dealer document decision.");
    }

    if (
        decision === "REJECTED" &&
        normalizedRejectionReason.length === 0
    ) {
        throw new Error(
            "A rejection reason is required when rejecting a dealer document.",
        );
    }

    if (normalizedRejectionReason.length > 5000) {
        throw new Error(
            "The rejection reason cannot exceed 5000 characters.",
        );
    }

    const result = await db.transaction(async (tx) => {
        /*
         * First, discover the parent application.
         * This initial read does not lock either row.
         */
        const [reference] = await tx
            .select({
                applicationId: dealerDocuments.applicationId,
            })
            .from(dealerDocuments)
            .where(
                eq(
                    dealerDocuments.id,
                    normalizedDocumentId,
                ),
            )
            .limit(1);

        if (!reference) {
            throw new Error("Dealer document not found.");
        }

        /*
         * Lock the application FIRST.
         *
         * This matches the lock order used by
         * reviewDealer() and the applicant document
         * upload/deletion workflows.
         */
        const [application] = await tx
            .select({
                id: dealerApplications.id,
                status: dealerApplications.status,
            })
            .from(dealerApplications)
            .where(
                eq(
                    dealerApplications.id,
                    reference.applicationId,
                ),
            )
            .for("update")
            .limit(1);

        if (!application) {
            throw new Error(
                "Associated dealer application not found.",
            );
        }

        if (application.status !== "PENDING") {
            throw new Error(
                "Documents can only be reviewed while the dealer application is pending.",
            );
        }

        /*
         * Then lock and re-read the document.
         */
        const [document] = await tx
            .select()
            .from(dealerDocuments)
            .where(
                and(
                    eq(
                        dealerDocuments.id,
                        normalizedDocumentId,
                    ),
                    eq(
                        dealerDocuments.applicationId,
                        application.id,
                    ),
                ),
            )
            .for("update")
            .limit(1);

        if (!document) {
            throw new Error(
                "Dealer document no longer exists.",
            );
        }

        if (document.status !== "PENDING") {
            throw new Error(
                "Only pending dealer documents can be reviewed.",
            );
        }

        const now = new Date();

        const [updatedDocument] = await tx
            .update(dealerDocuments)
            .set({
                status: decision,

                rejectionReason:
                    decision === "REJECTED"
                        ? normalizedRejectionReason
                        : null,

                reviewedByUserId: normalizedReviewerId,
                reviewedAt: now,
            })
            .where(
                eq(
                    dealerDocuments.id,
                    document.id,
                ),
            )
            .returning({
                id: dealerDocuments.id,
                applicationId: dealerDocuments.applicationId,
                documentType: dealerDocuments.documentType,
                status: dealerDocuments.status,
                rejectionReason: dealerDocuments.rejectionReason,
                reviewedByUserId: dealerDocuments.reviewedByUserId,
                reviewedAt: dealerDocuments.reviewedAt,
            });

        if (!updatedDocument) {
            throw new Error(
                "Failed to update dealer document review.",
            );
        }

        /*
         * Keep audit logging in the same transaction.
         */
        await writeAudit(tx, {
            actorUserId: normalizedReviewerId,
            action: `DEALER_DOCUMENT_${decision}`,
            entityType: "dealer_document",
            entityId: updatedDocument.id,
            metadata: {
                applicationId: updatedDocument.applicationId,
                documentType: updatedDocument.documentType,
                rejectionReason:
                    decision === "REJECTED"
                        ? normalizedRejectionReason
                        : null,
            },
        });

        return updatedDocument;
    });

    return result;
}
