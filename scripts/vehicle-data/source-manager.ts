import { and, eq } from "drizzle-orm";

import { db } from "../../src/database/index.ts";

import {
    vehicleDataSources,
    vehicleDataSourceLinks,
    type vehicleCatalogEntityTypeEnum,
    type vehicleCatalogSourceTypeEnum,
    type vehicleCatalogVerificationEnum,
} from "../../src/database/schema/index.ts";

import type {
    VehicleResearchSource,
} from "./types.ts";

type EntityType =
    (typeof vehicleCatalogEntityTypeEnum.enumValues)[number];

type VerificationStatus =
    (typeof vehicleCatalogVerificationEnum.enumValues)[number];

export async function getOrCreateVehicleSource(
    source: VehicleResearchSource,
): Promise<string> {
    const [saved] = await db
        .insert(vehicleDataSources)
        .values({
            name: source.name,
            url: source.url,
            sourceType: source.sourceType as (
                typeof vehicleCatalogSourceTypeEnum.enumValues
            )[number],
            licenseName: source.licenseName ?? null,
            licenseUrl: source.licenseUrl ?? null,
            attributionRequired:
                source.attributionRequired ?? false,
            attributionText: source.attributionText ?? null,
            reuseNotes: source.reuseNotes ?? null,
            active: true,
        })
        .onConflictDoUpdate({
            target: [
                vehicleDataSources.name,
                vehicleDataSources.url,
            ],
            set: {
                sourceType: source.sourceType as (
                    typeof vehicleCatalogSourceTypeEnum.enumValues
                )[number],
                licenseName: source.licenseName ?? null,
                licenseUrl: source.licenseUrl ?? null,
                attributionRequired:
                    source.attributionRequired ?? false,
                attributionText: source.attributionText ?? null,
                reuseNotes: source.reuseNotes ?? null,
                active: true,
                updatedAt: new Date(),
            },
        })
        .returning({
            id: vehicleDataSources.id,
        });

    if (!saved) {
        throw new Error(
            `Unable to register vehicle source: ${source.name}`,
        );
    }

    return saved.id;
}

export async function linkVehicleSource(input: {
    sourceId: string;
    entityType: EntityType;
    entityId: string;
    verificationStatus: VerificationStatus;
    accessedAt?: string;
    verifiedAt?: string;
    verificationNotes?: string;
}): Promise<void> {
    await db
        .insert(vehicleDataSourceLinks)
        .values({
            sourceId: input.sourceId,
            entityType: input.entityType,
            entityId: input.entityId,
            verificationStatus: input.verificationStatus,
            accessedAt: input.accessedAt
                ? new Date(input.accessedAt)
                : null,
            verifiedAt: input.verifiedAt
                ? new Date(input.verifiedAt)
                : null,
            verificationNotes:
                input.verificationNotes ?? null,
        })
        .onConflictDoUpdate({
            target: [
                vehicleDataSourceLinks.sourceId,
                vehicleDataSourceLinks.entityType,
                vehicleDataSourceLinks.entityId,
            ],
            set: {
                verificationStatus: input.verificationStatus,
                accessedAt: input.accessedAt
                    ? new Date(input.accessedAt)
                    : null,
                verifiedAt: input.verifiedAt
                    ? new Date(input.verifiedAt)
                    : null,
                verificationNotes:
                    input.verificationNotes ?? null,
                updatedAt: new Date(),
            },
        });
}

export async function attachVehicleSources(
    entityType: EntityType,
    entityId: string,
    sources: VehicleResearchSource[],
): Promise<void> {
    for (const source of sources) {
        const sourceId = await getOrCreateVehicleSource(source);

        await linkVehicleSource({
            sourceId,
            entityType,
            entityId,
            verificationStatus: source.verificationStatus,
            ...(source.accessedAt
                ? { accessedAt: source.accessedAt }
                : {}),
            ...(source.verificationStatus === "VERIFIED" && source.accessedAt
                ? { verifiedAt: source.accessedAt }
                : {}),
            ...(source.verificationNotes
                ? { verificationNotes: source.verificationNotes }
                : {}),
        });
    }
}