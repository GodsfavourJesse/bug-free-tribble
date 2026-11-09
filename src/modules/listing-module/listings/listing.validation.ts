import { z } from "zod";

const optionalTrimmedText = (max: number) =>
    z.string().trim().max(max).optional().or(z.literal(""));

const specificationsSchema = z
    .record(
        z.string().trim().min(1).max(80),
        z.union([
            z.string().trim().max(500),
            z.number().finite(),
            z.boolean(),
            z.null(),
        ]),
    )
    .default({});

const listingFieldsSchema = z.object({
    /** Optional catalogue link; manual listings leave this unset. */
    vehicleVariantId: z.string().uuid().nullable().optional(),

    makeName: z.string().trim().min(1).max(100).optional(),
    modelName: z.string().trim().min(1).max(120).optional(),
    year: z.coerce.number().int().min(1886).max(2100).optional(),
    generationName: optionalTrimmedText(120),
    variantName: optionalTrimmedText(160),

    bodyStyle: optionalTrimmedText(60),
    fuelType: optionalTrimmedText(60),
    transmission: optionalTrimmedText(60),
    driveType: optionalTrimmedText(60),
    engineCapacity: optionalTrimmedText(60),
    horsepower: z.coerce.number().int().nonnegative().optional(),
    exteriorColor: optionalTrimmedText(80),
    interiorColor: optionalTrimmedText(80),
    seats: z.coerce.number().int().positive().max(100).optional(),
    doors: z.coerce.number().int().positive().max(20).optional(),
    specifications: specificationsSchema,

    title: z.string().trim().min(5).max(200),
    description: z.string().trim().min(10).max(10000),
    price: z.coerce.number().finite().positive(),
    currency: z.string().trim().min(3).max(10).default("NGN"),
    mileage: z.coerce.number().int().nonnegative().optional(),
    condition: z
        .enum(["BRAND_NEW", "FOREIGN_USED", "NIGERIAN_USED"])
        .default("NIGERIAN_USED"),
    country: z.string().trim().min(1).max(100).default("Nigeria"),
    state: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
});

/** New listings need either a catalogue variant or a manual make/model/year. */
export const createListingSchema = listingFieldsSchema.superRefine(
    (value, context) => {
        const hasCatalogueVariant = Boolean(value.vehicleVariantId);
        const hasManualIdentity = Boolean(
            value.makeName?.trim() &&
            value.modelName?.trim() &&
            value.year,
        );

        if (!hasCatalogueVariant && !hasManualIdentity) {
            context.addIssue({
                code: "custom",
                path: ["makeName"],
                message: "Provide a vehicle make, model and year, or select a catalogue vehicle.",
            });
        }
    },
);

/** Updates are partial; identity validation is applied to the final listing state. */
export const updateListingSchema = listingFieldsSchema.partial();

export const listingImageSchema = z.object({
    sortOrder: z.coerce.number().int().nonnegative().default(0),
});
