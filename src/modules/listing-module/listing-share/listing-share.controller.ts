import type {
    NextFunction,
    Request,
    Response,
} from "express";
import { ListingSharePlatform, recordListingShare } from "./listing-share-service.ts";


const listingSharePlatforms = [
    "WHATSAPP",
    "FACEBOOK",
    "X",
    "COPY_LINK",
    "OTHER",
] as const;

function isListingSharePlatform(
    value: string,
): value is ListingSharePlatform {
    return listingSharePlatforms.some(
        (platform) => platform === value,
    );
}

export async function recordShare(
    request: Request<{ id: string }>,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const listingId =
            request.params.id?.trim();

        if (!listingId) {
            response.status(400).json({
                success: false,
                message: "Listing id is required.",
            });
            return;
        }

        const platformValue =
            request.body?.platform;

        if (
            typeof platformValue !== "string" ||
            !isListingSharePlatform(
                platformValue,
            )
        ) {
            response.status(400).json({
                success: false,
                message:
                    "A valid share platform is required.",
                data: {
                    allowedPlatforms:
                        listingSharePlatforms,
                },
            });
            return;
        }

        const input = {
            listingId,
            platform: platformValue,
            ...(request.user
                ? {
                      userId:
                          request.user.id,
                  }
                : {}),
        };

        const recorded =
            await recordListingShare(input);

        if (!recorded) {
            response.status(404).json({
                success: false,
                message:
                    "Listing not found or is not available.",
            });
            return;
        }

        response.status(201).json({
            success: true,
            message:
                "Listing share recorded.",
            data: {
                listingId,
                platform: platformValue,
            },
        });
    } catch (error) {
        next(error);
    }
}