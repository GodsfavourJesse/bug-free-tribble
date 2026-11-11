import type {
    Request,
    Response,
    NextFunction,
} from "express";

import {
    getAllStates,
    getLgasByState,
} from "./locations.service.js";

export function getStates(
    _req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        return res.status(200).json({
            success: true,
            data: getAllStates(),
        });
    } catch (error) {
        next(error);
    }
}

export function getStateLgas(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const state = req.params.state;

        if (typeof state !== "string" || !state.trim()) {
            return res.status(400).json({
                success: false,
                message: "A valid state parameter is required.",
            });
        }

        const lgas = getLgasByState(state);

        if (!lgas) {
            return res.status(404).json({
                success: false,
                message: "State not found.",
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                state,
                lgas,
            },
        });
    } catch (error) {
        next(error);
    }
}