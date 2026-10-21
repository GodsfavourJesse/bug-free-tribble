import type { Request, Response, NextFunction } from "express";

import { verifyEmailTransport } from "./email.service.ts";

export async function testEmailTransport(
    _req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        await verifyEmailTransport();

        res.status(200).json({
            success: true,
            message: "SMTP connection verified successfully.",
        });
    } catch (error) {
        next(error);
    }
}