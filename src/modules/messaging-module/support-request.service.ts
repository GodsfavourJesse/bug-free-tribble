import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../database/index.ts";
import { supportRequests, type SupportRequestMessage } from "../../database/schema/index.ts";
import { AppError } from "../../errors/app-error.ts";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSupportRequest(input: { userId?: string; name: string; email: string; subject: string; message: string }) {
    const accessToken = randomBytes(32).toString("base64url");
    const now = new Date().toISOString();
    const messages: SupportRequestMessage[] = [{ author: "customer", body: input.message.trim(), createdAt: now }];
    const [request] = await db.insert(supportRequests).values({
        ...(input.userId ? { userId: input.userId } : {}),
        name: input.name.trim(), email: input.email.trim().toLowerCase(),
        subject: input.subject.trim(), accessTokenHash: hashToken(accessToken), messages,
    }).returning({ id: supportRequests.id, status: supportRequests.status, createdAt: supportRequests.createdAt });
    if (!request) throw new AppError("Unable to create support request.", 500, "SUPPORT_REQUEST_CREATE_FAILED");
    return { request, accessToken };
}

export async function getSupportRequest(id: string, accessToken: string) {
    const [request] = await db.select({ id: supportRequests.id, name: supportRequests.name, email: supportRequests.email, subject: supportRequests.subject, status: supportRequests.status, messages: supportRequests.messages, createdAt: supportRequests.createdAt, updatedAt: supportRequests.updatedAt })
        .from(supportRequests).where(and(eq(supportRequests.id, id), eq(supportRequests.accessTokenHash, hashToken(accessToken)))).limit(1);
    if (!request) throw new AppError("Support request not found. Check the reference and access code.", 404, "SUPPORT_REQUEST_NOT_FOUND");
    return request;
}

export async function listSupportRequests() {
    return db.select({ id: supportRequests.id, name: supportRequests.name, email: supportRequests.email, subject: supportRequests.subject, status: supportRequests.status, messages: supportRequests.messages, createdAt: supportRequests.createdAt, updatedAt: supportRequests.updatedAt }).from(supportRequests).orderBy(desc(supportRequests.updatedAt)).limit(100);
}

export async function listMySupportRequests(userId: string) {
    return db.select({ id: supportRequests.id, name: supportRequests.name, email: supportRequests.email, subject: supportRequests.subject, status: supportRequests.status, messages: supportRequests.messages, createdAt: supportRequests.createdAt, updatedAt: supportRequests.updatedAt }).from(supportRequests).where(eq(supportRequests.userId, userId)).orderBy(desc(supportRequests.updatedAt)).limit(50);
}

export async function replyToSupportRequest(id: string, body: string) {
    return db.transaction(async (tx) => {
        const [request] = await tx.select().from(supportRequests).where(eq(supportRequests.id, id)).for("update").limit(1);
        if (!request) throw new AppError("Support request not found.", 404, "SUPPORT_REQUEST_NOT_FOUND");
        if (request.status === "CLOSED") throw new AppError("This request is closed.", 409, "SUPPORT_REQUEST_CLOSED");
        const messages = [...request.messages, { author: "support" as const, body: body.trim(), createdAt: new Date().toISOString() }];
        const [updated] = await tx.update(supportRequests).set({ messages, status: "IN_PROGRESS", updatedAt: new Date() }).where(eq(supportRequests.id, id)).returning({ id: supportRequests.id, status: supportRequests.status, messages: supportRequests.messages, updatedAt: supportRequests.updatedAt });
        return updated;
    });
}

export async function addCustomerSupportMessage(id: string, body: string, accessToken: string) {
    return db.transaction(async (tx) => {
        const [request] = await tx.select().from(supportRequests).where(eq(supportRequests.id, id)).for("update").limit(1);
        if (!request || request.accessTokenHash !== hashToken(accessToken)) throw new AppError("Support request not found.", 404, "SUPPORT_REQUEST_NOT_FOUND");
        if (request.status === "CLOSED") throw new AppError("This request is closed.", 409, "SUPPORT_REQUEST_CLOSED");
        const messages = [...request.messages, { author: "customer" as const, body: body.trim(), createdAt: new Date().toISOString() }];
        const [updated] = await tx.update(supportRequests).set({ messages, status: "OPEN", updatedAt: new Date() }).where(eq(supportRequests.id, id)).returning({ id: supportRequests.id, status: supportRequests.status, messages: supportRequests.messages, updatedAt: supportRequests.updatedAt });
        return updated;
    });
}
