import { createHmac } from "node:crypto";
import http from "node:http";

import { describe, expect, it, vi, afterEach } from "vitest";
import express, { type IncomingMessage, type Response } from "express";
import rateLimit from "express-rate-limit";

import { handleWebhookLinear, verifyLinearSignature, type WebhookHandlerDeps } from "../../src/http/webhook-handler.js";
import type { WebhookRequest } from "../../src/http/webhook-types.js";

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

const TEST_SECRET = "whsec_test_secret_abc123";

function sign(body: string, secret: string = TEST_SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "update",
    type: "Issue",
    data: { id: "issue-1", title: "Fix bug" },
    webhookTimestamp: Date.now(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<WebhookHandlerDeps> = {}): WebhookHandlerDeps {
  return {
    getWebhookSecret: vi.fn().mockReturnValue(TEST_SECRET),
    requestRefresh: vi.fn(),
    recordVerifiedDelivery: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
    ...overrides,
  };
}

function makeRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
  rawBody?: Buffer,
): WebhookRequest {
  const headerMap: Record<string, string> = { ...headers };

  return {
    body,
    rawBody,
    path: "/webhooks/linear",
    get: vi.fn((name: string) => headerMap[name.toLowerCase()]),
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as WebhookRequest;
}

function makeResponse(): Response & { _status: number; _body: unknown; _headers: Record<string, string> } {
  const res = {
    _status: 200,
    _body: null as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._body = data;
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown; _headers: Record<string, string> };
}

/* ------------------------------------------------------------------ */
/*  verifyLinearSignature                                              */
/* ------------------------------------------------------------------ */

describe("verifyLinearSignature", () => {
  it("returns true for a valid HMAC-SHA256 signature", () => {
    const body = Buffer.from('{"action":"update"}');
    const sig = sign(body.toString());
    expect(verifyLinearSignature(body, sig, TEST_SECRET)).toBe(true);
  });

  it("returns false for a mismatched signature", () => {
    const body = Buffer.from('{"action":"update"}');
    expect(verifyLinearSignature(body, "deadbeef".repeat(8), TEST_SECRET)).toBe(false);
  });

  it("returns false when signature length differs from expected", () => {
    const body = Buffer.from('{"action":"update"}');
    expect(verifyLinearSignature(body, "short", TEST_SECRET)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  handleWebhookLinear                                                */
/* ------------------------------------------------------------------ */

describe("handleWebhookLinear", () => {
  it("returns 200, calls requestRefresh and recordVerifiedDelivery for valid request", () => {
    const deps = makeDeps();
    const payload = makePayload();
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).ok).toBe(true);
    expect(deps.requestRefresh).toHaveBeenCalledWith("webhook:update:Issue");
    expect(deps.recordVerifiedDelivery).toHaveBeenCalledWith("Issue:update");
  });

  it("includes 'create' in refresh reason for Issue create events", () => {
    const deps = makeDeps();
    const payload = makePayload({ action: "create" });
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(res._status).toBe(200);
    expect(deps.requestRefresh).toHaveBeenCalledWith(expect.stringContaining("create"));
  });

  it("includes 'update' in refresh reason for Issue update events", () => {
    const deps = makeDeps();
    const payload = makePayload({ action: "update" });
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(res._status).toBe(200);
    expect(deps.requestRefresh).toHaveBeenCalledWith(expect.stringContaining("update"));
  });

  it("returns 401 for invalid HMAC signature, does NOT call requestRefresh or recordVerifiedDelivery", () => {
    const deps = makeDeps();
    const payload = makePayload();
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": "bad".repeat(21) + "b" }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(res._status).toBe(401);
    expect(deps.requestRefresh).not.toHaveBeenCalled();
    expect(deps.recordVerifiedDelivery).not.toHaveBeenCalled();
  });

  it("logs a warning on HMAC failure", () => {
    const deps = makeDeps();
    const payload = makePayload();
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": "bad".repeat(21) + "b" }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/webhooks/linear" }),
      expect.stringContaining("signature verification failed"),
    );
  });

  it("returns 401 when Linear-Signature header is missing", () => {
    const deps = makeDeps();
    const payload = makePayload();
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, {}, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(res._status).toBe(401);
    expect((res._body as { error: { code: string } }).error.code).toBe("signature_missing");
    expect(deps.requestRefresh).not.toHaveBeenCalled();
  });

  it("returns 401 when timestamp is older than 60 seconds (replay rejection)", () => {
    const deps = makeDeps();
    const staleTimestamp = Date.now() - 120_000; // 2 minutes ago
    const payload = makePayload({ webhookTimestamp: staleTimestamp });
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(res._status).toBe(401);
    expect((res._body as { error: { code: string } }).error.code).toBe("replay_rejected");
    expect(deps.requestRefresh).not.toHaveBeenCalled();
  });

  it("returns 401 when timestamp is in the far future (replay rejection)", () => {
    const deps = makeDeps();
    const futureTimestamp = Date.now() + 120_000; // 2 minutes from now
    const payload = makePayload({ webhookTimestamp: futureTimestamp });
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(res._status).toBe(401);
    expect((res._body as { error: { code: string } }).error.code).toBe("replay_rejected");
  });

  it("returns 503 with Retry-After when signing secret is not configured", () => {
    const deps = makeDeps({ getWebhookSecret: vi.fn().mockReturnValue(null) });
    const payload = makePayload();
    const bodyStr = JSON.stringify(payload);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, Buffer.from(bodyStr));
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(res._status).toBe(503);
    expect(res._headers["Retry-After"]).toBe("5");
    expect((res._body as { error: { code: string } }).error.code).toBe("webhook_not_configured");
  });

  it("returns 401 for empty body with valid signature (HMAC mismatch on parsed body)", () => {
    const deps = makeDeps();
    // Empty JSON object — signed correctly, but the parsed body has no
    // webhookTimestamp, so the replay check catches it as non-number.
    const emptyBody = "{}";
    const rawBody = Buffer.from(emptyBody);
    const req = makeRequest({} as Record<string, unknown>, { "linear-signature": sign(emptyBody) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    // HMAC is valid, but webhookTimestamp is missing (not a number) → replay_rejected
    expect(res._status).toBe(401);
    expect((res._body as { error: { code: string } }).error.code).toBe("replay_rejected");
  });

  it("returns 401 when rawBody is missing (no Buffer captured)", () => {
    const deps = makeDeps();
    const payload = makePayload();
    const bodyStr = JSON.stringify(payload);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) });
    // rawBody intentionally omitted
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(res._status).toBe(401);
    expect((res._body as { error: { code: string } }).error.code).toBe("signature_invalid");
  });

  it("returns 200 and triggers refresh for non-Issue event types (broad acceptance)", () => {
    const deps = makeDeps();
    const payload = makePayload({ action: "create", type: "Comment" });
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(res._status).toBe(200);
    expect(deps.requestRefresh).toHaveBeenCalledWith("webhook:create:Comment");
    expect(deps.recordVerifiedDelivery).toHaveBeenCalledWith("Comment:create");
  });
});

/* ------------------------------------------------------------------ */
/*  Rate limiting (integration — requires real Express middleware)      */
/* ------------------------------------------------------------------ */

/* eslint-disable sonarjs/x-powered-by -- test-only express app, not production */
function startRateLimitedApp(webhookDeps: WebhookHandlerDeps): Promise<{ port: number; server: http.Server }> {
  const app = express();
  app.use(
    express.json({
      verify: (req: IncomingMessage, _res, buf: Buffer) => {
        if (req.url?.startsWith("/webhooks/")) {
          (req as unknown as WebhookRequest).rawBody = buf;
        }
      },
    }),
  );

  const webhookLimiter = rateLimit({
    windowMs: 60_000,
    limit: 3, // Low limit for testing
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post("/webhooks/linear", webhookLimiter, (req, res) => {
    handleWebhookLinear(webhookDeps, req as WebhookRequest, res);
  });

  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve({ port: address.port, server });
      }
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("webhook rate limiting", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await closeServer(server);
      server = null;
    }
  });

  it("returns 429 after exceeding the rate limit", async () => {
    const deps = makeDeps();
    const { port, server: s } = await startRateLimitedApp(deps);
    server = s;

    const sendRequest = () => {
      const payload = makePayload();
      const bodyStr = JSON.stringify(payload);
      return fetch(`http://127.0.0.1:${port}/webhooks/linear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Linear-Signature": sign(bodyStr),
        },
        body: bodyStr,
      });
    };

    // Exhaust the 3-request limit
    const first = await sendRequest();
    expect(first.status).toBe(200);

    const second = await sendRequest();
    expect(second.status).toBe(200);

    const third = await sendRequest();
    expect(third.status).toBe(200);

    // Fourth request should be rate-limited
    const fourth = await sendRequest();
    expect(fourth.status).toBe(429);
  });
});
