import {
    and,
    eq,
} from "drizzle-orm";

import { env } from "../../config/env.ts";

import { db } from "../../database/index.ts";

import {
    dealerApplications,
    dealerDocuments,
    dealerProfiles,
    users,
} from "../../database/schema/index.ts";

import {
    createObjectKey,
    getObjectStorage,
} from "../../infrastructure/storage/object-storage.ts";

import {
    validateDealerDocument,
} from "./dealer-document.validator.ts";

export async function applyAsDealer(
    userId: string,
    input: {
        companyName: string;
        registrationNumber?: string;
        businessAddress?: string;
    },
) {
    const normalizedUserId = userId.trim();
    const companyName = input.companyName.trim();
    const registrationNumber =
        input.registrationNumber?.trim() ?? "";
    const businessAddress =
        input.businessAddress?.trim() ?? "";

    /*
     * Validate the authenticated user ID.
     */
    if (!normalizedUserId) {
        throw new Error(
            "User ID is required.",
        );
    }

    /*
     * Validate company information.
     */
    if (!companyName) {
        throw new Error(
            "Company name is required.",
        );
    }

    if (companyName.length > 200) {
        throw new Error(
            "Company name cannot exceed 200 characters.",
        );
    }

    if (registrationNumber.length > 100) {
        throw new Error(
            "Company registration number cannot exceed 100 characters.",
        );
    }

    if (businessAddress.length > 10_000) {
        throw new Error(
            "Business address is too long.",
        );
    }

    /*
     * Confirm that the user exists and determine
     * their current account type.
     */
    const userResult = await db
        .select({
            id: users.id,
            accountType: users.accountType,
        })
        .from(users)
        .where(
            eq(
                users.id,
                normalizedUserId,
            ),
        )
        .limit(1);

    const user = userResult[0];

    if (!user) {
        throw new Error(
            "User account not found.",
        );
    }

    /*
     * Existing dealers must not submit another
     * dealer application.
     */
    if (user.accountType === "DEALER") {
        throw new Error(
            "Your account is already a dealer account.",
        );
    }

    /*
     * Check for an existing pending application.
     *
     * The database's partial unique index remains the
     * authoritative protection against concurrent requests.
     */
    const existing = await db
        .select({
            id: dealerApplications.id,
        })
        .from(dealerApplications)
        .where(
            and(
                eq(
                    dealerApplications.userId,
                    normalizedUserId,
                ),
                eq(
                    dealerApplications.status,
                    "PENDING",
                ),
            ),
        )
        .limit(1);

    if (existing[0]) {
        throw new Error(
            "You already have a pending dealer application.",
        );
    }

    /*
     * Build the insert values without assigning
     * undefined to optional database fields.
     */
    const values:
        typeof dealerApplications.$inferInsert = {
            userId: normalizedUserId,
            companyName,
            status: "PENDING",
        };

    if (registrationNumber) {
        values.registrationNumber =
            registrationNumber;
    }

    if (businessAddress) {
        values.businessAddress =
            businessAddress;
    }

    /*
     * Create the application.
     *
     * PostgreSQL's unique partial index prevents duplicate
     * pending applications if concurrent requests pass
     * the preceding application check.
     */
    const result = await db
        .insert(dealerApplications)
        .values(values)
        .returning();

    const application = result[0];

    if (!application) {
        throw new Error(
            "Dealer application could not be created.",
        );
    }

    return application;
}

export async function uploadDealerDocument(
    userId: string,
    applicationId: string,
    documentType: string,
    file: Express.Multer.File,
) {
    const normalizedUserId = userId.trim();
    const normalizedApplicationId = applicationId.trim();
    const normalizedDocumentType = documentType.trim().toUpperCase();

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(normalizedUserId)) {
        throw new Error("Invalid user ID.");
    }

    if (!uuidRegex.test(normalizedApplicationId)) {
        throw new Error("Invalid application ID.");
    }

    if (
        !/^[A-Z0-9][A-Z0-9 _-]{1,99}$/.test(
            normalizedDocumentType,
        )
    ) {
        throw new Error("Invalid dealer document type.");
    }

    if (!file?.buffer || file.buffer.length === 0) {
        throw new Error("Dealer document file is empty.");
    }

    const validated = validateDealerDocument(
        file.buffer,
        file.mimetype,
    );

    const storage = getObjectStorage();

    const objectKey = createObjectKey(
        `dealer-documents/${normalizedApplicationId}`,
        validated.format,
    );

    let uploadedKey: string | undefined;

    try {
        const uploaded = await storage.put(
            objectKey,
            file.buffer,
            file.mimetype,
            {
                resourceType: "raw",
                access: "private",
            },
        );

        uploadedKey = uploaded.key;

        const document = await db.transaction(async (tx) => {
            const [application] = await tx
                .select({
                    id: dealerApplications.id,
                    status: dealerApplications.status,
                })
                .from(dealerApplications)
                .where(
                    and(
                        eq(
                            dealerApplications.id,
                            normalizedApplicationId,
                        ),
                        eq(
                            dealerApplications.userId,
                            normalizedUserId,
                        ),
                    ),
                )
                .for("update");

            if (!application) {
                throw new Error(
                    "Dealer application not found or access denied.",
                );
            }

            if (application.status !== "PENDING") {
                throw new Error(
                    "Documents can only be uploaded while the dealer application is pending.",
                );
            }

            const [inserted] = await tx
                .insert(dealerDocuments)
                .values({
                    applicationId: application.id,
                    documentType: normalizedDocumentType,
                    objectKey: uploaded.key,
                })
                .returning({
                    id: dealerDocuments.id,
                    applicationId: dealerDocuments.applicationId,
                    documentType: dealerDocuments.documentType,
                    status: dealerDocuments.status,
                    rejectionReason: dealerDocuments.rejectionReason,
                    createdAt: dealerDocuments.createdAt,
                });

            if (!inserted) {
                throw new Error(
                    "Dealer document was not created.",
                );
            }

            return inserted;
        });

        return document;
    } catch (error) {
        if (uploadedKey) {
            try {
                await storage.delete(uploadedKey, {
                    resourceType: "raw",
                    access: "private",
                });
            } catch {
                // Preserve the original error.
                // A durable storage-cleanup mechanism is still needed.
            }
        }

        throw error;
    }
}

export async function getDealerDocuments(
    userId: string,
    applicationId: string,
) {
    const normalizedUserId = userId.trim();
    const normalizedApplicationId = applicationId.trim();

    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            normalizedUserId,
        )
    ) {
        throw new Error("Invalid user ID.");
    }

    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            normalizedApplicationId,
        )
    ) {
        throw new Error("Invalid application ID.");
    }

    const [application] = await db
        .select({
            id: dealerApplications.id,
        })
        .from(dealerApplications)
        .where(
            and(
                eq(dealerApplications.id, normalizedApplicationId),
                eq(dealerApplications.userId, normalizedUserId),
            ),
        )
        .limit(1);

    if (!application) {
        throw new Error("Dealer application not found.");
    }

    const documents = await db
        .select({
            id: dealerDocuments.id,
            applicationId: dealerDocuments.applicationId,
            documentType: dealerDocuments.documentType,
            status: dealerDocuments.status,
            rejectionReason: dealerDocuments.rejectionReason,
            reviewedAt: dealerDocuments.reviewedAt,
            createdAt: dealerDocuments.createdAt,
        })
        .from(dealerDocuments)
        .where(
            eq(
                dealerDocuments.applicationId,
                normalizedApplicationId,
            ),
        )
        .orderBy(dealerDocuments.createdAt);

    return documents;
}

export async function getDealerDocumentSignedUrl(
    userId: string,
    documentId: string,
) {
    const result =
        await db
            .select({
                documentId:
                    dealerDocuments.id,

                objectKey:
                    dealerDocuments.objectKey,

                applicationUserId:
                    dealerApplications.userId,

                documentType:
                    dealerDocuments.documentType,
            })
            .from(
                dealerDocuments,
            )
            .innerJoin(
                dealerApplications,
                eq(
                    dealerDocuments.applicationId,
                    dealerApplications.id,
                ),
            )
            .where(
                and(
                    eq(
                        dealerDocuments.id,
                        documentId,
                    ),
                    eq(
                        dealerApplications.userId,
                        userId,
                    ),
                ),
            )
            .limit(1);

    const document =
        result[0];

    if (!document) {
        throw new Error(
            "Dealer document not found or access denied.",
        );
    }

    const storage =
        getObjectStorage();

    const url =
        storage.signedUrl(
            document.objectKey,
            {
                resourceType:
                    "raw",

                access:
                    "private",

                expiresInSeconds:
                    env.PRIVATE_DOCUMENT_SIGNED_URL_TTL_SECONDS,

                attachment:
                    false,
            },
        );

    return {
        documentId:
            document.documentId,

        documentType:
            document.documentType,

        url,
    };
}

export async function deleteDealerDocument(
    userId: string,
    documentId: string,
): Promise<{ success: true }> {
    const normalizedUserId = userId.trim();
    const normalizedDocumentId = documentId.trim();

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(normalizedUserId)) {
        throw new Error("Invalid user ID.");
    }

    if (!uuidRegex.test(normalizedDocumentId)) {
        throw new Error("Invalid document ID.");
    }

    const objectKey = await db.transaction(async (tx) => {
        // Find the application associated with this user's document.
        const [reference] = await tx
            .select({
                applicationId: dealerDocuments.applicationId,
            })
            .from(dealerDocuments)
            .innerJoin(
                dealerApplications,
                eq(
                    dealerDocuments.applicationId,
                    dealerApplications.id,
                ),
            )
            .where(
                and(
                    eq(
                        dealerDocuments.id,
                        normalizedDocumentId,
                    ),
                    eq(
                        dealerApplications.userId,
                        normalizedUserId,
                    ),
                ),
            )
            .limit(1);

        if (!reference) {
            throw new Error("Dealer document not found.");
        }

        // Use the same parent-row lock as the upload workflow.
        const [application] = await tx
            .select({
                id: dealerApplications.id,
                status: dealerApplications.status,
            })
            .from(dealerApplications)
            .where(
                and(
                    eq(
                        dealerApplications.id,
                        reference.applicationId,
                    ),
                    eq(
                        dealerApplications.userId,
                        normalizedUserId,
                    ),
                ),
            )
            .for("update");

        if (!application) {
            throw new Error("Dealer application not found.");
        }

        if (application.status !== "PENDING") {
            throw new Error(
                "Documents can only be deleted while the application is pending.",
            );
        }

        // Re-read the document after acquiring the application lock.
        const [document] = await tx
            .select({
                id: dealerDocuments.id,
                objectKey: dealerDocuments.objectKey,
                status: dealerDocuments.status,
            })
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
            .limit(1);

        if (!document) {
            throw new Error("Dealer document no longer exists.");
        }

        if (document.status === "APPROVED") {
            throw new Error(
                "Approved dealer documents cannot be deleted.",
            );
        }

        const [deletedDocument] = await tx
            .delete(dealerDocuments)
            .where(
                and(
                    eq(dealerDocuments.id, document.id),
                    eq(
                        dealerDocuments.applicationId,
                        application.id,
                    ),
                ),
            )
            .returning({
                id: dealerDocuments.id,
            });

        if (!deletedDocument) {
            throw new Error(
                "The dealer document could not be deleted.",
            );
        }

        return document.objectKey;
    });

    try {
        await getObjectStorage().delete(objectKey, {
            resourceType: "raw",
            access: "private",
        });
    } catch {
        throw new Error(
            "The document record was deleted, but its private storage file could not be removed. Storage cleanup is required.",
        );
    }

    return { success: true };
}

