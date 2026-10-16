// import request from "supertest";
// import { describe, expect, it } from "vitest";

// import app from "../src/app.ts";
// import { AppError, NotFoundError } from "../src/errors/app-error.ts";

// describe("Phase 1: infrastructure", () => {
//     describe("request id", () => {
//         it("generates a request id", async () => {
//             const response = await request(app).get("/health/live");

//             expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
//         });

//         it("echoes a safe incoming request id", async () => {
//             const response = await request(app)
//                 .get("/health/live")
//                 .set("X-Request-Id", "client-req-12345");

//             expect(response.headers["x-request-id"]).toBe("client-req-12345");
//         });

//         it("replaces an unsafe incoming request id", async () => {
//             const response = await request(app)
//                 .get("/health/live")
//                 .set("X-Request-Id", "bad id with spaces");

//             expect(response.headers["x-request-id"]).not.toBe("bad id with spaces");
//         });
//     });

//     describe("health", () => {
//         it("reports live", async () => {
//             const response = await request(app).get("/health/live");

//             expect(response.status).toBe(200);
//             expect(response.body.status).toBe("live");
//         });

//         it("reports not ready when the database is unreachable", async () => {
//             const response = await request(app).get("/health/ready");

//             expect(response.status).toBe(503);
//             expect(response.body.checks.database).toBe("down");
//         });
//     });

//     describe("security headers", () => {
//         it("sets hardened headers and disables caching", async () => {
//             const response = await request(app).get("/health/live");

//             expect(response.headers["x-powered-by"]).toBeUndefined();
//             expect(response.headers["x-content-type-options"]).toBe("nosniff");
//             expect(response.headers["x-frame-options"]).toBe("DENY");
//             expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
//             expect(response.headers["cache-control"]).toBe("no-store");
//         });
//     });

//     describe("CORS", () => {
//         it("allows the configured client origin with credentials", async () => {
//             const response = await request(app)
//                 .get("/health/live")
//                 .set("Origin", "http://localhost:3000");

//             expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
//             expect(response.headers["access-control-allow-credentials"]).toBe("true");
//         });

//         it("allows additional configured origins", async () => {
//             const response = await request(app)
//                 .get("/health/live")
//                 .set("Origin", "http://localhost:3001");

//             expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3001");
//         });

//         it("does not grant CORS headers to unknown origins", async () => {
//             const response = await request(app)
//                 .get("/health/live")
//                 .set("Origin", "https://evil.example");

//             expect(response.headers["access-control-allow-origin"]).toBeUndefined();
//         });
//     });

//     describe("centralized errors", () => {
//         it("returns a consistent 404", async () => {
//             const response = await request(app).get("/api/v1/does-not-exist");

//             expect(response.status).toBe(404);
//             expect(response.body).toMatchObject({
//                 success: false,
//                 code: "NOT_FOUND",
//                 message: "Route not found.",
//             });
//             expect(response.body.requestId).toBe(response.headers["x-request-id"]);
//         });

//         it("rejects malformed JSON with 400 instead of 500", async () => {
//             const response = await request(app)
//                 .post("/api/v1/auth/login")
//                 .set("Content-Type", "application/json")
//                 .send("{not json");

//             expect(response.status).toBe(400);
//             expect(response.body.code).toBe("BAD_REQUEST");
//         });

//         it("enforces the configured JSON body limit with 413", async () => {
//             const response = await request(app)
//                 .post("/api/v1/auth/login")
//                 .set("Content-Type", "application/json")
//                 .send(JSON.stringify({ filler: "x".repeat(4_000) }));

//             expect(response.status).toBe(413);
//             expect(response.body.code).toBe("PAYLOAD_TOO_LARGE");
//         });

//         it("accepts url-encoded bodies", async () => {
//             const response = await request(app)
//                 .post("/api/v1/does-not-exist")
//                 .type("form")
//                 .send({ a: "1" });

//             // Parsed fine; falls through to the 404 handler.
//             expect(response.status).toBe(404);
//         });

//         it("exposes AppError metadata", () => {
//             const error = new NotFoundError("Missing");

//             expect(error).toBeInstanceOf(AppError);
//             expect(error.statusCode).toBe(404);
//             expect(error.isOperational).toBe(true);
//         });
//     });

//     describe("rate limiting", () => {
//         it("throttles auth endpoints with 429 and Retry-After", async () => {
//             const statuses: number[] = [];
//             let last = await request(app).post("/api/v1/auth/login").send({});

//             statuses.push(last.status);

//             for (let attempt = 0; attempt < 4; attempt += 1) {
//                 last = await request(app).post("/api/v1/auth/login").send({});
//                 statuses.push(last.status);
//             }

//             expect(statuses).toContain(429);
//             expect(last.body.code).toBe("RATE_LIMITED");
//             expect(Number(last.headers["retry-after"])).toBeGreaterThan(0);
//         });

//         it("never rate limits health probes", async () => {
//             for (let attempt = 0; attempt < 10; attempt += 1) {
//                 const response = await request(app).get("/health/live");
//                 expect(response.status).toBe(200);
//             }
//         });
//     });
// });
