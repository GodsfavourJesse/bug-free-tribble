import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { env } from "../../config/env.ts";
import { getUserFromSession } from "../auth/auth.service.ts";
import { addCustomerSupportMessage, createSupportRequest, getSupportRequest, listMySupportRequests, listSupportRequests, replyToSupportRequest } from "./support-request.service.ts";

const createSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.email().max(254), subject: z.string().trim().min(5).max(150), message: z.string().trim().min(10).max(5000) });
const replySchema = z.object({ message: z.string().trim().min(1).max(5000) });

export async function createPublicSupportRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const input = createSchema.parse(req.body);
        const sessionToken = req.cookies?.[env.SESSION_COOKIE_NAME];
        const user = sessionToken ? await getUserFromSession(sessionToken).catch(() => null) : null;
        const result = await createSupportRequest({ ...input, ...(user?.id ? { userId: user.id } : {}) });
        res.status(201).json({ success: true, message: "Your request is with our support team.", data: { id: result.request.id, accessToken: result.accessToken } });
    } catch (error) { next(error); }
}

export async function getPublicSupportRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const id = z.uuid().parse(req.params.requestId);
        const accessToken = z.string().min(20).parse(req.get("x-support-access-token"));
        res.json({ success: true, data: { request: await getSupportRequest(id, accessToken) } });
    } catch (error) { next(error); }
}

export async function addCustomerSupportReply(req: Request, res: Response, next: NextFunction) {
    try {
        const id = z.uuid().parse(req.params.requestId);
        const accessToken = z.string().min(20).parse(req.get("x-support-access-token"));
        const { message } = replySchema.parse(req.body);
        res.status(201).json({ success: true, data: { request: await addCustomerSupportMessage(id, message, accessToken) } });
    } catch (error) { next(error); }
}

export async function listAdminSupportRequests(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: { requests: await listSupportRequests() } }); }
    catch (error) { next(error); }
}

export async function listMyPublicSupportRequests(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user?.id) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
        res.json({ success: true, data: { requests: await listMySupportRequests(req.user.id) } });
    } catch (error) { next(error); }
}

export async function replyAdminSupportRequest(req: Request, res: Response, next: NextFunction) {
    try {
        const id = z.uuid().parse(req.params.requestId);
        const { message } = replySchema.parse(req.body);
        res.json({ success: true, data: { request: await replyToSupportRequest(id, message) } });
    } catch (error) { next(error); }
}
