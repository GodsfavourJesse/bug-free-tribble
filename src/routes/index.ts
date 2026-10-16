import { Router } from "express";

import apiV1Routes from "./api-v1.routes.ts";

const router = Router();

/*
 * API versions
 */
router.use(
    "/api/v1",
    apiV1Routes,
);

export default router;