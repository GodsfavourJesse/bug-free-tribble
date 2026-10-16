import "http";
import "express-serve-static-core";

import type {
    AuthenticatedUser,
} from "./auth.ts";
import { AuthenticatedAdmin } from "../modules/admin-module/admin-auth/admin-auth.service.ts";

declare module "http" {
    interface IncomingMessage {
        rawBody?: Buffer;
    }
}

declare module "express-serve-static-core" {
    interface Request {
        requestId: string;

        // Customer authentication
        user?: AuthenticatedUser;

        // Administrator authentication
        admin?: AuthenticatedAdmin;

        visitorId?: string;
    }
}