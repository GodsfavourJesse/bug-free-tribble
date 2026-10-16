import type {
    NextFunction,
    Request,
    Response,
} from "express";
import { reconcileListingCredits } from "./credit-reconcilation.service.ts";

export async function reconcileListingCreditsController(
    _request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const result = await reconcileListingCredits();

        response.status(200).json({
            success: true,
            message:
                result.status === "HEALTHY"
                    ? "Listing credit reconciliation completed successfully."
                    : "Listing credit reconciliation completed with issues.",
            data: result,
        });
    } catch (error: unknown) {
        next(error);
    }
}