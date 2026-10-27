import {
    and,
    count,
    desc,
    eq,
    inArray,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";
import path from "node:path";

import {
    dealerApplications,
    dealerDocuments,
    dealerProfiles,
    users,
} from "../../../database/schema/index.ts";

import { createNotification } from "../../notification-module/notification.service.ts";

import { writeAudit } from "../admin.service.ts";
import { getObjectStorage } from "../../../infrastructure/storage/object-storage.ts";
import { env } from "../../../config/env.ts";
import { sendDealerDecisionEmail, sendNotificationEmail } from "../../email-module/email.service.ts";

type DealerApplicationStatus =
    | "PENDING"
    | "APPROVED"
    | "REJECTED";

type DealerApplicationFilter =
    | DealerApplicationStatus
    | "ALL";

function getDealerDocumentMimeType(
    objectKey: string,
): string {
    const extension = path.extname(objectKey).toLowerCase();

    const mimeTypes: Record<string, string> = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    };

    return mimeTypes[extension] ?? "application/octet-stream";
}

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
    status: DealerApplicationFilter = "PENDING",
    page = 1,
    limit = 20,
) {
    const normalizedPage = Math.max(
        1,
        Math.floor(page),
    );

    const normalizedLimit = Math.min(
        100,
        Math.max(1, Math.floor(limit)),
    );

    const offset =
        (normalizedPage - 1) * normalizedLimit;

    /*
     * ALL does not apply a status condition.
     * Other filters retrieve only their matching status.
     */
    const statusCondition =
        status === "ALL"
            ? undefined
            : eq(
                  dealerApplications.status,
                  status,
              );

    /*
     * Retrieve the applications and applicant information.
     *
     * No document join is used here, so an application
     * appears only once regardless of its document count.
     */
    const applicationQuery = db
        .select({
            application: dealerApplications,

            user: {
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
            },
        })
        .from(dealerApplications)
        .innerJoin(
            users,
            eq(
                users.id,
                dealerApplications.userId,
            ),
        );

    const applicationRows = await (
        statusCondition
            ? applicationQuery.where(statusCondition)
            : applicationQuery
    )
        .orderBy(
            desc(dealerApplications.createdAt),
        )
        .limit(normalizedLimit)
        .offset(offset);

    /*
     * Count matching applications in the database.
     */
    const countQuery = db
        .select({
            total: count(),
        })
        .from(dealerApplications);

    const [countResult] = await (
        statusCondition
            ? countQuery.where(statusCondition)
            : countQuery
    );

    const total = Number(
        countResult?.total ?? 0,
    );

    /*
     * Fetch documents for every application on this page.
     */
    const applicationIds = applicationRows.map(
        (row) => row.application.id,
    );

    const documents = applicationIds.length > 0
        ? await db
              .select()
              .from(dealerDocuments)
              .where(
                  inArray(
                      dealerDocuments.applicationId,
                      applicationIds,
                  ),
              )
        : [];

    /*
     * Group documents by application ID.
     */
    const documentsByApplication = new Map<
        string,
        typeof documents
    >();

    for (const document of documents) {
        const existing =
            documentsByApplication.get(
                document.applicationId,
            ) ?? [];

        existing.push(document);

        documentsByApplication.set(
            document.applicationId,
            existing,
        );
    }

    return {
        applications: applicationRows.map(
            ({ application, user }) => ({
                application,
                user,

                documents:
                    documentsByApplication.get(
                        application.id,
                    ) ?? [],
            }),
        ),

        pagination: {
            page: normalizedPage,
            limit: normalizedLimit,
            total,

            totalPages: Math.ceil(
                total / normalizedLimit,
            ),

            hasNextPage:
                normalizedPage * normalizedLimit < total,

            hasPreviousPage:
                normalizedPage > 1,
        },
    };
}

export async function listDealerApplicationHistory(
    status?: "APPROVED" | "REJECTED",
    page = 1,
    limit = 20,
) {
    const normalizedPage = Math.max(
        1,
        Math.floor(page),
    );

    const normalizedLimit = Math.min(
        100,
        Math.max(1, Math.floor(limit)),
    );

    const offset =
        (normalizedPage - 1) * normalizedLimit;

    const conditions = status
        ? and(
              eq(dealerApplications.status, status),
              // History never includes pending applications.
          )
        : undefined;

    /*
     * Retrieve reviewed applications only.
     */
    const applicationRows = await db
        .select({
            application: dealerApplications,

            user: {
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
            },
        })
        .from(dealerApplications)
        .innerJoin(
            users,
            eq(
                users.id,
                dealerApplications.userId,
            ),
        )
        .where(
            status
                ? conditions
                : inArray(
                      dealerApplications.status,
                      ["APPROVED", "REJECTED"],
                  ),
        )
        .orderBy(
            desc(dealerApplications.reviewedAt),
        )
        .limit(normalizedLimit)
        .offset(offset);

    const [countResult] = await db
        .select({
            total: count(),
        })
        .from(dealerApplications)
        .where(
            status
                ? conditions
                : inArray(
                      dealerApplications.status,
                      ["APPROVED", "REJECTED"],
                  ),
        );

    const total = Number(countResult?.total ?? 0);

    const applicationIds = applicationRows.map(
        (row) => row.application.id,
    );

    const documents = applicationIds.length > 0
        ? await db
              .select()
              .from(dealerDocuments)
              .where(
                  inArray(
                      dealerDocuments.applicationId,
                      applicationIds,
                  ),
              )
        : [];

    const documentsByApplication = new Map<
        string,
        typeof documents
    >();

    for (const document of documents) {
        const existing =
            documentsByApplication.get(
                document.applicationId,
            ) ?? [];

        existing.push(document);

        documentsByApplication.set(
            document.applicationId,
            existing,
        );
    }

    return {
        applications: applicationRows.map(
            ({ application, user }) => ({
                application,
                user,
                documents:
                    documentsByApplication.get(
                        application.id,
                    ) ?? [],
            }),
        ),

        pagination: {
            page: normalizedPage,
            limit: normalizedLimit,
            total,
            totalPages: Math.ceil(
                total / normalizedLimit,
            ),
            hasNextPage:
                normalizedPage * normalizedLimit < total,
            hasPreviousPage:
                normalizedPage > 1,
        },
    };
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

    // ============================================================
    // 1. VALIDATE INPUT
    // ============================================================

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
        throw new Error("A rejection reason is required.");
    }

    if (normalizedRejectionReason.length > 5000) {
        throw new Error(
            "The rejection reason cannot exceed 5000 characters.",
        );
    }

    // ============================================================
    // 2. TRANSACTIONAL REVIEW
    // ============================================================

    const result = await db.transaction(async (tx) => {
        /*
         * Lock the application to prevent concurrent reviews.
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
            throw new Error("Dealer application not found.");
        }

        if (application.status !== "PENDING") {
            throw new Error(
                "Only pending dealer applications can be reviewed.",
            );
        }

        // ========================================================
        // 3. LOCK AND VALIDATE APPLICANT
        // ========================================================

        const [applicant] = await tx
            .select({
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
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

        // ========================================================
        // 4. APPROVAL VALIDATION
        // ========================================================

        if (decision === "APPROVED") {
            /*
             * Lock submitted documents before validating them.
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
             * Prevent an existing dealer from receiving
             * another dealer profile through a second application.
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
             * Do not overwrite an unexpected existing profile.
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

        // ========================================================
        // 5. UPDATE APPLICATION STATUS
        // ========================================================

        const now = new Date();

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

        // ========================================================
        // 6. CREATE VERIFIED DEALER PROFILE
        // ========================================================

        if (decision === "APPROVED") {
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
             * Upgrade only an account that is still a regular user.
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

        // ========================================================
        // 7. TRANSACTIONAL AUDIT LOG
        // ========================================================

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

        /*
         * Return everything needed by post-commit notifications
         * and email delivery.
         */
        return {
            ...updatedApplication,

            applicantEmail: applicant.email,
            applicantFirstName: applicant.firstName,
            applicantLastName: applicant.lastName,
        };
    });

    // ============================================================
    // 8. POST-COMMIT PREPARATION
    // ============================================================

    /*
     * The database transaction has committed successfully.
     *
     * Failures in notification or email delivery must not undo
     * an approved/rejected application.
     */

    const applicantName =
        result.applicantFirstName?.trim() || "there";

    const reviewDate = result.reviewedAt
        ? new Date(result.reviewedAt).toLocaleString(
            "en-NG",
            {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: "Africa/Lagos",
            },
        )
        : new Date().toLocaleString(
            "en-NG",
            {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: "Africa/Lagos",
            },
        );

    const applicationUrl =
        `${env.CLIENT_URL}/dashboard/dealer/applications`;

    // ============================================================
    // 9. CREATE IN-APP NOTIFICATION
    // ============================================================

    try {
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
                    ? "Congratulations! Your dealer application has been approved. Your account has been upgraded to dealer status."
                    : `Your dealer application has been rejected. Reason: ${normalizedRejectionReason}`,

            data: {
                applicationId: result.id,
                status: decision,
                companyName: result.companyName,

                rejectionReason:
                    decision === "REJECTED"
                        ? normalizedRejectionReason
                        : null,
            },
        });
    } catch (error: unknown) {
        console.error(
            "[DEALER] Failed to create review notification.",
            {
                applicationId: result.id,
                userId: result.userId,
                decision,

                error:
                    error instanceof Error
                        ? error.message
                        : String(error),
            },
        );
    }

    // ============================================================
    // 10. SEND BRANDED APPROVAL OR REJECTION EMAIL
    // ============================================================

    const email = result.applicantEmail?.trim();

    if (!email) {
        console.warn(
            "[DEALER EMAIL] Review email skipped because the applicant has no email address.",
            {
                applicationId: result.id,
                userId: result.userId,
                decision,
            },
        );
    } else {
        try {
            if (decision === "APPROVED") {
                await sendDealerDecisionEmail({
                    decision: "APPROVED",
                    email,
                    firstName: applicantName,
                    companyName: result.companyName,
                    reviewDate,
                });
            } else {
                await sendDealerDecisionEmail({
                    decision: "REJECTED",
                    email,
                    firstName: applicantName,
                    companyName: result.companyName,
                    rejectionReason: normalizedRejectionReason,
                    reviewDate,
                });
            }

            console.info(
                `[DEALER EMAIL] ${decision} email submitted successfully.`,
                {
                    applicationId: result.id,
                    userId: result.userId,
                    email,
                    decision,
                },
            );
        } catch (error: unknown) {
            console.error(
                `[DEALER EMAIL] Failed to send ${decision.toLowerCase()} email.`,
                {
                    applicationId: result.id,
                    userId: result.userId,
                    email,
                    decision,

                    error:
                        error instanceof Error
                            ? {
                                name: error.name,
                                message: error.message,
                            }
                            : String(error),
                },
            );
        }
    }

    // ============================================================
    // 11. RETURN REVIEW RESULT
    // ============================================================

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

/* =========================================================
   ADMIN DEALER DOCUMENT PREVIEW
========================================================= */

export async function getAdminDealerDocumentSignedUrl(
    documentId: string,
) {
    const normalizedDocumentId = documentId.trim();

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(normalizedDocumentId)) {
        throw new Error("Invalid dealer document ID.");
    }

    const [document] = await db
        .select({
            id: dealerDocuments.id,
            applicationId: dealerDocuments.applicationId,
            documentType: dealerDocuments.documentType,
            status: dealerDocuments.status,
            objectKey: dealerDocuments.objectKey,
            applicationStatus: dealerApplications.status,
        })
        .from(dealerDocuments)
        .innerJoin(
            dealerApplications,
            eq(
                dealerApplications.id,
                dealerDocuments.applicationId,
            ),
        )
        .where(
            eq(
                dealerDocuments.id,
                normalizedDocumentId,
            ),
        )
        .limit(1);

    if (!document) {
        throw new Error(
            "Dealer verification document not found.",
        );
    }

    if (!document.objectKey) {
        throw new Error(
            "The dealer document has no valid storage reference.",
        );
    }

    const expiresInSeconds = 300;

    const signedUrl = getObjectStorage().signedUrl(
        document.objectKey,
        {
            resourceType: "raw",
            access: "private",
            expiresInSeconds,
            attachment: false,
        },
    );

    return {
        id: document.id,
        applicationId: document.applicationId,
        documentType: document.documentType,
        status: document.status,
        applicationStatus: document.applicationStatus,
        url: signedUrl,
        mimeType: getDealerDocumentMimeType(
            document.objectKey,
        ),
        expiresInSeconds,
    };
}

