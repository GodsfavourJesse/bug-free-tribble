import {
    Router,
} from "express";

import {
    z,
} from "zod";

import {
    getGenerations,
    getMakes,
    getModels,
    getVariants,
    search,
} from "./vehicle.controller.ts";
import { listModelYears } from "./vehicle-model-year/vehicle-model-year.service.ts";

const router = Router();

const generationIdSchema = z.string().uuid();

const marketQuerySchema = z.enum([
    "true",
    "false",
]).optional();

/**
 * Search the vehicle catalog.
 *
 * GET /search
 */
router.get(
    "/search",
    search,
);

/**
 * List vehicle makes.
 *
 * GET /makes
 */
router.get(
    "/makes",
    getMakes,
);

/**
 * List models belonging to a make.
 *
 * GET /makes/:makeId/models
 */
router.get(
    "/makes/:makeId/models",
    getModels,
);

/**
 * List generations belonging to a model.
 *
 * GET /models/:modelId/generations
 */
router.get(
    "/models/:modelId/generations",
    getGenerations,
);

/**
 * List model years belonging to a generation.
 *
 * GET /generations/:generationId/years
 *
 * Query parameters:
 *   market=true  -> Nigerian-market records only (default)
 *   market=false -> All active records
 */
router.get(
    "/generations/:generationId/years",
    async (request, response, next) => {
        try {
            const generationIdResult =
                generationIdSchema.safeParse(
                    request.params.generationId,
                );

            if (!generationIdResult.success) {
                response.status(400).json({
                    success: false,
                    message:
                        "Invalid vehicle generation ID.",
                });

                return;
            }

            const marketResult =
                marketQuerySchema.safeParse(
                    request.query.market,
                );

            if (!marketResult.success) {
                response.status(400).json({
                    success: false,
                    message:
                        'The market parameter must be either "true" or "false".',
                });

                return;
            }

            const nigeriaMarket =
                marketResult.data !== "false";

            const years = await listModelYears(
                generationIdResult.data,
                {
                    nigeriaMarket,
                },
            );

            response.status(200).json({
                success: true,
                data: years,
            });
        } catch (error) {
            next(error);
        }
    },
);

/**
 * List variants belonging to a generation.
 *
 * GET /generations/:generationId/variants
 */
router.get(
    "/generations/:generationId/variants",
    getVariants,
);

export default router;