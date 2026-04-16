import { createHmac } from "node:crypto";
import http from "node:http";

import { describe, expect, it, vi, afterEach } from "vitest";
import express, { type IncomingMessage, type Response } from "express";
import rateLimit from "express-rate-limit";

import { handleWebhookLinear, verifyLinearSignature, type WebhookHandlerDeps } from "../../src/webhook/http-adapter.js";
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
    data: { id: "issue-1", identifier: "SYM-42", title: "Fix bug" },
    webhookTimestamp: Date.now(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<WebhookHandlerDeps> = {}): WebhookHandlerDeps {
  return {
    getWebhookSecret: vi.fn().mockReturnValue(TEST_SECRET),
    getPreviousWebhookSecret: vi.fn().mockReturnValue(null),
    requestRefresh: vi.fn(),
    requestTargetedRefresh: vi.fn(),
    stopWorkerForIssue: vi.fn(),
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

/** Flush the microtask queue so fire-and-forget inbox promises resolve. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
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
  it("returns 200 and triggers targeted refresh for valid Issue update", async () => {
    const deps = makeDeps();
    const payload = makePayload();
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);
    await flushMicrotasks();

    expect(res._status).toBe(200);
    expect(deps.requestTargetedRefresh).toHaveBeenCalledWith("issue-1", "SYM-42", "webhook:issue:update");
    expect(deps.recordVerifiedDelivery).toHaveBeenCalledWith("Issue:update");
  });

  it("includes 'create' in refresh reason for Issue create events", async () => {
    const deps = makeDeps();
    const payload = makePayload({ action: "create" });
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);
    await flushMicrotasks();

    expect(res._status).toBe(200);
    expect(deps.requestTargetedRefresh).toHaveBeenCalledWith("issue-1", "SYM-42", expect.stringContaining("create"));
  });

  it("includes 'update' in refresh reason for Issue update events", async () => {
    const deps = makeDeps();
    const payload = makePayload({ action: "update" });
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);
    await flushMicrotasks();

    expect(res._status).toBe(200);
    expect(deps.requestTargetedRefresh).toHaveBeenCalledWith("issue-1", "SYM-42", expect.stringContaining("update"));
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
    expect(deps.requestTargetedRefresh).not.toHaveBeenCalled();
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

  it("returns 400 for empty body (schema validation failure)", () => {
    const deps = makeDeps();
    const emptyBody = "{}";
    const rawBody = Buffer.from(emptyBody);
    const req = makeRequest({} as Record<string, unknown>, { "linear-signature": sign(emptyBody) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);

    expect(res._status).toBe(400);
    expect((res._body as { error: { code: string } }).error.code).toBe("invalid_payload");
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

  it("returns 200 and triggers targeted refresh for Comment event", async () => {
    const deps = makeDeps();
    const payload = makePayload({
      action: "create",
      type: "Comment",
      data: { id: "comment-1", identifier: "SYM-42", issue: { id: "issue-1", identifier: "SYM-42" } },
    });
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);
    await flushMicrotasks();

    expect(res._status).toBe(200);
    expect(deps.recordVerifiedDelivery).toHaveBeenCalledWith("Comment:create");
  });

  it("accepts previous secret during rotation window", async () => {
    const prevSecret = "whsec_previous_secret_xyz";
    const deps = makeDeps({ getPreviousWebhookSecret: vi.fn().mockReturnValue(prevSecret) });
    const payload = makePayload();
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr);
    // Sign with the previous secret
    const req = makeRequest(payload, { "linear-signature": sign(bodyStr, prevSecret) }, rawBody);
    const res = makeResponse();

    handleWebhookLinear(deps, req, res);
    await flushMicrotasks();

    expect(res._status).toBe(200);
    expect(deps.recordVerifiedDelivery).toHaveBeenCalledWith("Issue:update");
  });
});

/* ------------------------------------------------------------------ */
/*  Rate limiting (integration — requires real Express middleware)      */
/* ------------------------------------------------------------------ */

function startRateLimitedApp(webhookDeps: WebhookHandlerDeps): Promise<{ port: number; server: http.Server }> {
  const app = express();
  app.use(
    express.json({
      limit: "1mb",
      verify: (req: IncomingMessage, _res, buf: Buffer) => {
        if (req.url?.startsWith("/webhooks/")) {
          (req as unknown as WebhookRequest).rawBody = buf;
        }
      },
    }),
  );

  app.use(
    "/webhooks/{*splat}",
    rateLimit({
      windowMs: 60_000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.post("/webhooks/linear", (req, res) => handleWebhookLinear(webhookDeps, req as WebhookRequest, res));

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      resolve({ port: addr.port, server });
    });
  });
}

function postWebhook(port: number, body: string, secret: string = TEST_SECRET): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const sig = sign(body, secret);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/webhooks/linear",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Linear-Signature": sig,
        },
      },
      (res) => resolve({ status: res.statusCode! }),
    );
    req.on("error", reject);
    req.end(body);
  });
}

describe("Webhook rate limiting (integration)", () => {
  let server: http.Server | undefined;

  afterEach(() => {
    server?.close();
  });

  it("rate-limits after exceeding max requests", async () => {
    const deps = makeDeps();
    ({ server } = await startRateLimitedApp(deps));
    const port = (server!.address() as { port: number }).port;

    const payload = JSON.stringify(makePayload());

    const r1 = await postWebhook(port, payload);
    expect(r1.status).toBe(200);
    const r2 = await postWebhook(port, payload);
    expect(r2.status).toBe(200);
    const r3 = await postWebhook(port, payload);
    expect(r3.status).toBe(429);
  });
});
