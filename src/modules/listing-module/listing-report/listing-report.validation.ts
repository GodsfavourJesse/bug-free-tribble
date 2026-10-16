import { z } from "zod";

export const listingReportReasons = [
    "SCAM_OR_FRAUD",
    "WRONG_VEHICLE_INFORMATION",
    "DUPLICATE_LISTING",
    "ALREADY_SOLD",
    "INAPPROPRIATE_CONTENT",
    "MISLEADING_PRICE",
    "OTHER",
] as const;

export const createListingReportSchema = z.object({
    reason: z.enum(listingReportReasons),

    details: z
        .string()
        .trim()
        .max(
            2000,
            "Report details cannot exceed 2000 characters.",
        )
        .optional(),
});