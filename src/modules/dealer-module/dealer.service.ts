import {
    and,
    desc,
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

import path from "node:path";


const DEALER_BIO_MAX_LENGTH = 500;
const PROFILE_PICTURE_MAX_SIZE = 5 * 1024 * 1024;
const COVER_PHOTO_MAX_SIZE = 8 * 1024 * 1024;

const ALLOWED_PROFILE_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

type DealerProfileImageType = 
    | "profile-picture"
    | "cover-photo";

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
    const result = await db
        .select({
            documentId: dealerDocuments.id,
            objectKey: dealerDocuments.objectKey,
            documentType: dealerDocuments.documentType,
            applicationUserId: dealerApplications.userId,
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
                eq(dealerDocuments.id, documentId),
                eq(dealerApplications.userId, userId),
            ),
        )
        .limit(1);

    const document = result[0];

    if (!document) {
        throw new Error(
            "Dealer document not found or access denied.",
        );
    }

    if (!document.objectKey) {
        throw new Error(
            "The dealer document has no valid storage reference.",
        );
    }

    const storage = getObjectStorage();

    const expiresInSeconds =
        env.PRIVATE_DOCUMENT_SIGNED_URL_TTL_SECONDS;

    const mimeType = getDealerDocumentMimeType(
        document.objectKey,
    );

    const url = storage.signedUrl(
        document.objectKey,
        {
            resourceType: "raw",
            access: "private",
            expiresInSeconds,
            attachment: false,
        },
    );

    return {
        documentId: document.documentId,
        documentType: document.documentType,
        url,
        mimeType,
        contentType: mimeType,
        expiresInSeconds,
        fileName: path.basename(document.objectKey),
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

export async function getMyDealerApplications(
    userId: string,
) {
    const normalizedUserId = userId.trim();

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(normalizedUserId)) {
        throw new Error("Invalid user ID.");
    }

    const applications = await db
        .select({
            id: dealerApplications.id,
            companyName: dealerApplications.companyName,
            registrationNumber: dealerApplications.registrationNumber,
            businessAddress: dealerApplications.businessAddress,
            status: dealerApplications.status,
            rejectionReason: dealerApplications.rejectionReason,
            submittedAt: dealerApplications.createdAt,
            reviewedAt: dealerApplications.reviewedAt,
            updatedAt: dealerApplications.updatedAt,
        })
        .from(dealerApplications)
        .where(
            eq(
                dealerApplications.userId,
                normalizedUserId,
            ),
        )
        .orderBy(
            desc(dealerApplications.createdAt),
        );

    return applications;
}

function validateDealerProfileImage(
    file: Express.Multer.File,
    imageType: DealerProfileImageType,
): {
    format: string;
    maxSize: number;
} {
    if (!file?.buffer || file.buffer.length === 0) {
        throw new Error("Please select an image to upload.");
    }

    const maxSize =
        imageType === "profile-picture"
            ? PROFILE_PICTURE_MAX_SIZE
            : COVER_PHOTO_MAX_SIZE;

    if (file.buffer.length > maxSize) {
        throw new Error(
            imageType === "profile-picture"
                ? "Profile pictures must not exceed 5 MB."
                : "Cover photos must not exceed 8 MB.",
        );
    }

    if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.mimetype)) {
        throw new Error(
            "Only JPEG, PNG, and WebP images are allowed.",
        );
    }

    /*
     * Check the actual file signature instead of trusting
     * the client-provided MIME type alone.
     */
    const buffer = file.buffer;

    const isJpeg =
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff;

    const isPng =
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(
            Buffer.from([
                0x89,
                0x50,
                0x4e,
                0x47,
                0x0d,
                0x0a,
                0x1a,
                0x0a,
            ]),
        );

    const isWebp =
        buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP";

    let format: string;

    if (isJpeg && file.mimetype === "image/jpeg") {
        format = "jpg";
    } else if (isPng && file.mimetype === "image/png") {
        format = "png";
    } else if (isWebp && file.mimetype === "image/webp") {
        format = "webp";
    } else {
        throw new Error(
            "The image content does not match its declared file type.",
        );
    }

    return {
        format,
        maxSize,
    };
}

/**
 * Resolve the authenticated user's editable dealer profile.
 *
 * This function deliberately checks accountType in the database.
 * A client cannot gain dealer access by changing request data.
 */
async function requireDealerProfile(
    userId: string,
) {
    const normalizedUserId = userId.trim();

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(normalizedUserId)) {
        throw new Error("Invalid user ID.");
    }

    const [user] = await db
        .select({
            id: users.id,
            accountType: users.accountType,
        })
        .from(users)
        .where(
            eq(users.id, normalizedUserId),
        )
        .limit(1);

    if (!user) {
        throw new Error("User account not found.");
    }

    if (user.accountType !== "DEALER") {
        throw new Error(
            "Only dealer accounts can customize a dealer profile.",
        );
    }

    const [profile] = await db
        .select({
            id: dealerProfiles.id,
            userId: dealerProfiles.userId,
            companyName: dealerProfiles.companyName,
            verified: dealerProfiles.verified,
            verifiedAt: dealerProfiles.verifiedAt,
            bio: dealerProfiles.bio,
            profilePictureUrl: dealerProfiles.profilePictureUrl,
            profilePicturePublicId:
                dealerProfiles.profilePicturePublicId,
            coverPhotoUrl: dealerProfiles.coverPhotoUrl,
            coverPhotoPublicId:
                dealerProfiles.coverPhotoPublicId,
            createdAt: dealerProfiles.createdAt,
        })
        .from(dealerProfiles)
        .where(
            eq(
                dealerProfiles.userId,
                normalizedUserId,
            ),
        )
        .limit(1);

    if (!profile) {
        throw new Error(
            "Dealer profile not found. Please contact support.",
        );
    }

    return profile;
}

/**
 * Get the current dealer's editable profile.
 */
export async function getMyDealerProfile(
    userId: string,
) {
    return requireDealerProfile(userId);
}

/**
 * Update the dealer's public bio.
 */
export async function updateMyDealerBio(
    userId: string,
    bio: unknown,
) {
    const profile = await requireDealerProfile(userId);

    if (typeof bio !== "string") {
        throw new Error("Bio must be a string.");
    }

    const normalizedBio = bio.trim();

    if (normalizedBio.length > DEALER_BIO_MAX_LENGTH) {
        throw new Error(
            `Your bio cannot exceed ${DEALER_BIO_MAX_LENGTH} characters.`,
        );
    }

    const [updated] = await db
        .update(dealerProfiles)
        .set({
            bio: normalizedBio || null,
        })
        .where(
            eq(
                dealerProfiles.id,
                profile.id,
            ),
        )
        .returning({
            id: dealerProfiles.id,
            companyName: dealerProfiles.companyName,
            bio: dealerProfiles.bio,
            profilePictureUrl:
                dealerProfiles.profilePictureUrl,
            coverPhotoUrl: dealerProfiles.coverPhotoUrl,
            verified: dealerProfiles.verified,
            verifiedAt: dealerProfiles.verifiedAt,
        });

    if (!updated) {
        throw new Error(
            "Your dealer bio could not be updated.",
        );
    }

    return updated;
}

/**
 * Upload or replace a dealer profile picture or cover photo.
 */
export async function uploadMyDealerProfileImage(
    userId: string,
    imageType: DealerProfileImageType,
    file: Express.Multer.File,
) {
    const profile = await requireDealerProfile(userId);

    const validated = validateDealerProfileImage(
        file,
        imageType,
    );

    const isProfilePicture =
        imageType === "profile-picture";

    const previousPublicId = isProfilePicture
        ? profile.profilePicturePublicId
        : profile.coverPhotoPublicId;

    const storage = getObjectStorage();

    const objectKey = createObjectKey(
        `dealer-profiles/${profile.id}/${imageType}`,
        validated.format,
    );

    const uploaded = await storage.put(
        objectKey,
        file.buffer,
        file.mimetype,
        {
            resourceType: "image",
            access: "public",
        },
    );

    try {
        const [updated] = await db
            .update(dealerProfiles)
            .set(
                isProfilePicture
                    ? {
                          profilePictureUrl: uploaded.url,
                          profilePicturePublicId: uploaded.key,
                      }
                    : {
                          coverPhotoUrl: uploaded.url,
                          coverPhotoPublicId: uploaded.key,
                      },
            )
            .where(
                eq(
                    dealerProfiles.id,
                    profile.id,
                ),
            )
            .returning({
                id: dealerProfiles.id,
                companyName: dealerProfiles.companyName,
                bio: dealerProfiles.bio,
                profilePictureUrl:
                    dealerProfiles.profilePictureUrl,
                coverPhotoUrl:
                    dealerProfiles.coverPhotoUrl,
                verified: dealerProfiles.verified,
                verifiedAt: dealerProfiles.verifiedAt,
            });

        if (!updated) {
            throw new Error(
                "Your image was uploaded, but the dealer profile could not be updated.",
            );
        }

        /*
         * The database now points to the new image.
         * Clean up the old image only after the update succeeds.
         */
        if (
            previousPublicId &&
            previousPublicId !== uploaded.key
        ) {
            try {
                await storage.delete(previousPublicId, {
                    resourceType: "image",
                    access: "public",
                });
            } catch {
                /*
                 * Keep the successful profile update.
                 * Failed cleanup can be handled by a storage
                 * cleanup job later.
                 */
            }
        }

        return updated;
    } catch (error) {
        /*
         * Do not leave an unused upload behind if the database
         * update fails.
         */
        try {
            await storage.delete(uploaded.key, {
                resourceType: "image",
                access: "public",
            });
        } catch {
            // Preserve the original error.
        }

        throw error;
    }
}
