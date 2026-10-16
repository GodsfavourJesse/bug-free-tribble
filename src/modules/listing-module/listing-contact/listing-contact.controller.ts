import type {
    NextFunction,
    Request,
    Response,
} from "express";

import {
    contactListingSeller,
} from "./listing-contact.service.ts";

import {
    contactSellerSchema,
} from "./listing-contact.validation.ts";

export async function contactSeller(
    request: Request<{
        id: string;
    }>,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!request.user) {
            response.status(401).json({
                success: false,
                message:
                    "Authentication required.",
            });
            return;
        }

        const listingId =
            request.params.id?.trim();

        if (!listingId) {
            response.status(400).json({
                success: false,
                message:
                    "Listing id is required.",
            });
            return;
        }

        const parsed =
            contactSellerSchema.safeParse(
                request.body,
            );

        if (!parsed.success) {
            response.status(400).json({
                success: false,
                message:
                    "Invalid contact seller request.",
                errors:
                    parsed.error.flatten(),
            });
            return;
        }

        const input = {
            listingId,
            buyerId: request.user.id,
            ...(parsed.data.message !== undefined
                ? {
                      message:
                          parsed.data.message,
                  }
                : {}),
        };

        const result =
            await contactListingSeller(input);

        response.status(200).json({
            success: true,
            message: result.messageSent
                ? "Message sent to seller."
                : "Seller conversation opened.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
}