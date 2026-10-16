import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import type {
    Request,
    Response,
} from "express";

import type {
    IncomingMessage,
} from "node:http";

import type {
    Options,
} from "pino-http";

import { env } from "./config/env.ts";
import { logger } from "./config/logger.ts";
import { corsOptions } from "./config/cors.ts";

import routes from "./routes.ts";

import { requestIdMiddleware } from "./middleware/request-id.middleware.ts";
import { globalRateLimiter } from "./middleware/rate-limit.middleware.ts";
import { securityHeaders } from "./middleware/security.middleware.ts";
import { errorHandler } from "./middleware/error.middleware.ts";
import healthRoutes from "./health/health.routes.ts";

const require = createRequire(import.meta.url);

const pinoHttpModule =
    require("pino-http") as {
        default?: (
            options?: Options,
        ) => express.RequestHandler;

        pinoHttp?: (
            options?: Options,
        ) => express.RequestHandler;
    };

const pinoHttp =
    pinoHttpModule.default ??
    pinoHttpModule.pinoHttp;

if (!pinoHttp) {
    throw new Error(
        "Unable to load the pino-http middleware.",
    );
}

const app = express();

/*
|--------------------------------------------------------------------------
| Application fingerprinting
|--------------------------------------------------------------------------
|
| Do not expose Express through the X-Powered-By header.
|
*/

app.disable("x-powered-by");

/*
|--------------------------------------------------------------------------
| Reverse proxy configuration
|--------------------------------------------------------------------------
|
| TRUST_PROXY must match the actual number of trusted proxy hops in
| the deployment environment.
|
| Do not set this to an arbitrary value. Incorrect proxy trust can
| allow clients to influence the IP address used by rate limiting.
|
*/

app.set("trust proxy", env.TRUST_PROXY);

/*
|--------------------------------------------------------------------------
| Request ID
|--------------------------------------------------------------------------
|
| Establish a request identifier early so subsequent middleware,
| logs and error responses can correlate a request.
|
*/

app.use(requestIdMiddleware);

/*
|--------------------------------------------------------------------------
| HTTP logging
|--------------------------------------------------------------------------
|
| Keep structured logging enabled.
|
| Do not log request bodies, passwords, authorization tokens,
| session cookies or payment secrets.
|
*/

app.use(
    pinoHttp({
        logger,

        genReqId: (
            request: IncomingMessage,
        ) => {
            const requestId = (
                request as IncomingMessage & {
                    requestId?: string;
                }
            ).requestId;

            return requestId ?? randomUUID();
        },

        customProps: (
            request: IncomingMessage,
        ) => {
            const requestId = (
                request as IncomingMessage & {
                    requestId?: string;
                }
            ).requestId;

            return {
                requestId,
            };
        },
    }),
);

app.use("/health", healthRoutes);

/*
|--------------------------------------------------------------------------
| Security headers
|--------------------------------------------------------------------------
|
| Use the centralized Helmet configuration.
|
| The API should not serve arbitrary executable HTML. If the API
| later serves frontend pages or documentation, review the CSP
| separately for those routes.
|
*/

app.use(securityHeaders);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
|
| Use the centralized allowlist from config/cors.ts.
|
| Credentials are supported for cookie-based authentication.
| Wildcard origins must not be used with credentialed requests.
|
*/

app.use(cors(corsOptions));

/*
|--------------------------------------------------------------------------
| Global rate limiting
|--------------------------------------------------------------------------
|
| Apply request limits before parsing request bodies and executing
| application routes.
|
| More restrictive route-specific limits will be applied to
| authentication, uploads and other sensitive operations.
|
*/

app.use(globalRateLimiter);

/*
|--------------------------------------------------------------------------
| JSON body parser
|--------------------------------------------------------------------------
|
| Retain the original request body for Paystack webhook signature
| verification.
|
| Webhook verification must use the exact raw bytes received,
| not a JSON object that has been parsed and serialized again.
|
*/

app.use(
    express.json({
        limit: env.JSON_BODY_LIMIT,

        verify: (
            request: Request,
            _response: Response,
            buffer: Buffer,
        ) => {
            (
                request as Request & {
                    rawBody?: Buffer;
                }
            ).rawBody = Buffer.from(buffer);
        },
    }),
);

/*
|--------------------------------------------------------------------------
| URL-encoded body parser
|--------------------------------------------------------------------------
|
| extended: false prevents nested object parsing for form bodies
| where nested structures are not needed.
|
| If existing KARMASS endpoints explicitly depend on nested
| URL-encoded objects, preserve that contract before changing it.
|
*/

app.use(
    express.urlencoded({
        extended: false,
        limit: env.URL_ENCODED_BODY_LIMIT,
        parameterLimit: 100,
    }),
);

/*
|--------------------------------------------------------------------------
| Cookie parsing
|--------------------------------------------------------------------------
|
| Cookie parsing makes cookie values available to authentication
| middleware. Parsing does not validate a session or authorize a user.
|
*/

app.use(cookieParser());

/*
|--------------------------------------------------------------------------
| Application routes
|--------------------------------------------------------------------------
*/

app.use(routes);

/*
|--------------------------------------------------------------------------
| Centralized error handling
|--------------------------------------------------------------------------
|
| This must remain last so errors from routes and preceding
| middleware can be handled consistently.
|
*/

app.use(errorHandler);

export default app;