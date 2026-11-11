import { Router } from "express";

import {
    getStates,
    getStateLgas,
} from "./locations.controller.js";

const router = Router();

router.get("/states", getStates);

router.get("/states/:state/lgas", getStateLgas);

export default router;