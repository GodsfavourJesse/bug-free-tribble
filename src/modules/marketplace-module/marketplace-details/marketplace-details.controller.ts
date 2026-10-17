import type {
    Request,
    Response,
} from "express";

import {
    getMarketplaceListingDetails,
} from "./marketplace-details.service.ts";
import { createAnonymousViewerKey, recordListingView } from "../../listing-module/listing-view/listing-view.service.ts";


export async function getListingDetails(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const listingId =
            request.params.listingId;

        if (
            typeof listingId !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                listingId,
            )
        ) {
            response.status(400).json({
                success: false,
                message:
                    "A valid listing ID is required.",
            });

            return;
        }

        const listing =
            await getMarketplaceListingDetails(
                listingId,
            );

        if (!listing) {
            response.status(404).json({
                success: false,
                message:
                    "This vehicle listing is unavailable.",
            });

            return;
        }

        /*
         * Record view tracking independently from
         * the successful detail response.
         *
         * The listing-view service already prevents
         * duplicate daily views for the same viewer.
         */
        const visitorId = request.visitorId;

        if (
            typeof visitorId === "string" &&
            visitorId.length > 0
        ) {
            try {
                await recordListingView({
                    listingId,
                    viewerKey:
                        createAnonymousViewerKey(
                            visitorId,
                        ),
                });
            } catch (trackingError) {
                console.error(
                    "[marketplace.recordListingView]",
                    trackingError,
                );
            }
        }

        response.status(200).json({
            success: true,
            data: listing,
        });
    } catch (error) {
        console.error(
            "[marketplace.getListingDetails]",
            error,
        );

        response.status(500).json({
            success: false,
            message:
                "Unable to load vehicle details.",
        });
    }
}