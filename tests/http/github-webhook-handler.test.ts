import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";

import {
  handleWebhookGitHub,
  verifyGitHubSignature,
  type GitHubWebhookHandlerDeps,
} from "../../src/http/github-webhook-handler.js";
import type { WebhookRequest } from "../../src/http/webhook-types.js";
import { createMockLogger } from "../helpers.js";

const TEST_SECRET = "github-secret";

function sign(body: string, secret: string = TEST_SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function makeDeps(overrides: Partial<GitHubWebhookHandlerDeps> = {}): GitHubWebhookHandlerDeps {
  return {
    configStore: {
      getConfig: () =>
        ({
          triggers: { githubSecret: TEST_SECRET },
          tracker: { kind: "github", owner: "acme", repo: "awesome" },
        }) as ReturnType<NonNullable<GitHubWebhookHandlerDeps["configStore"]>["getConfig"]>,
    },
    requestTargetedRefresh: vi.fn(),
    stopWorkerForIssue: vi.fn(),
    webhookInbox: {
      insertVerified: vi.fn().mockResolvedValue({ isNew: true }),
    },
    logger: createMockLogger(),
    ...overrides,
  };
}

function makeRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
  rawBody?: Buffer,
): WebhookRequest {
  const headerMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    headerMap[key.toLowerCase()] = value;
  }
  return {
    body,
    rawBody,
    path: "/webhooks/github",
    get: vi.fn((name: string) => headerMap[name.toLowerCase()]),
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as WebhookRequest;
}

function makeResponse(): Response & { _status: number; _body: unknown } {
  const res = {
    _status: 200,
    _body: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._body = data;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeIssuePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "opened",
    issue: {
      number: 7,
    },
    repository: {
      full_name: "acme/awesome",
    },
    ...overrides,
  };
}

describe("verifyGitHubSignature", () => {
  it("accepts a matching sha256 signature", () => {
    const body = Buffer.from('{"action":"opened"}');
    expect(verifyGitHubSignature(body, `sha256=${sign(body.toString())}`, TEST_SECRET)).toBe(true);
  });

  it("rejects a mismatched signature", () => {
    const body = Buffer.from('{"action":"opened"}');
    expect(verifyGitHubSignature(body, "sha256=deadbeef", TEST_SECRET)).toBe(false);
  });
});

describe("handleWebhookGitHub", () => {
  it("accepts a valid issues webhook and requests a targeted refresh", async () => {
    const deps = makeDeps();
    const payload = makeIssuePayload();
    const rawBody = Buffer.from(JSON.stringify(payload));
    const req = makeRequest(
      payload,
      {
        "x-hub-signature-256": `sha256=${sign(rawBody.toString())}`,
        "x-github-event": "issues",
        "x-github-delivery": "delivery-1",
      },
      rawBody,
    );
    const res = makeResponse();

    handleWebhookGitHub(deps, req, res);
    await flushMicrotasks();

    expect(res._status).toBe(200);
    expect(deps.requestTargetedRefresh).toHaveBeenCalledWith("7", "acme/awesome#7", "github:issues:opened");
    expect(deps.stopWorkerForIssue).not.toHaveBeenCalled();
  });

  it("stops a running worker when GitHub reports the issue closed", async () => {
    const deps = makeDeps();
    const payload = makeIssuePayload({ action: "closed" });
    const rawBody = Buffer.from(JSON.stringify(payload));
    const req = makeRequest(
      payload,
      {
        "x-hub-signature-256": `sha256=${sign(rawBody.toString())}`,
        "x-github-event": "issues",
      },
      rawBody,
    );
    const res = makeResponse();

    handleWebhookGitHub(deps, req, res);
    await flushMicrotasks();

    expect(deps.stopWorkerForIssue).toHaveBeenCalledWith("acme/awesome#7", "github webhook reported issue closed");
  });

  it("skips duplicate deliveries after inbox dedup", async () => {
    const deps = makeDeps({
      webhookInbox: {
        insertVerified: vi.fn().mockResolvedValue({ isNew: false }),
      },
    });
    const payload = makeIssuePayload();
    const rawBody = Buffer.from(JSON.stringify(payload));
    const req = makeRequest(
      payload,
      {
        "x-hub-signature-256": `sha256=${sign(rawBody.toString())}`,
        "x-github-event": "issues",
        "x-github-delivery": "delivery-dup",
      },
      rawBody,
    );
    const res = makeResponse();

    handleWebhookGitHub(deps, req, res);
    await flushMicrotasks();

    expect(res._status).toBe(200);
    expect(deps.requestTargetedRefresh).not.toHaveBeenCalled();
  });

  it("returns 401 when the signature is invalid", () => {
    const deps = makeDeps();
    const payload = makeIssuePayload();
    const rawBody = Buffer.from(JSON.stringify(payload));
    const req = makeRequest(
      payload,
      {
        "x-hub-signature-256": "sha256=bad-signature",
        "x-github-event": "issues",
      },
      rawBody,
    );
    const res = makeResponse();

    handleWebhookGitHub(deps, req, res);

    expect(res._status).toBe(401);
    expect(deps.requestTargetedRefresh).not.toHaveBeenCalled();
  });

  it("ignores events for repos that do not match the configured tracker repo", async () => {
    const deps = makeDeps();
    const payload = makeIssuePayload({
      repository: {
        full_name: "other/repo",
      },
    });
    const rawBody = Buffer.from(JSON.stringify(payload));
    const req = makeRequest(
      payload,
      {
        "x-hub-signature-256": `sha256=${sign(rawBody.toString())}`,
        "x-github-event": "issues",
      },
      rawBody,
    );
    const res = makeResponse();

    handleWebhookGitHub(deps, req, res);
    await flushMicrotasks();

    expect(res._status).toBe(200);
    expect(deps.requestTargetedRefresh).not.toHaveBeenCalled();
  });
});
