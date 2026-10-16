import { Router } from "express";

import {
    getGenerations,
    getMakes,
    getModels,
    getVariants,
    search,
} from "./vehicle.controller.ts";

const router = Router();

router.get(
    "/search",
    search,
);

router.get(
    "/makes",
    getMakes,
);

router.get(
    "/makes/:makeId/models",
    getModels,
);

router.get(
    "/models/:modelId/generations",
    getGenerations,
);

router.get(
    "/generations/:generationId/variants",
    getVariants,
);

export default router;