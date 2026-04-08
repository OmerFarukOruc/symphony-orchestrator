import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerWebhookRoutes } from "../../src/http/routes/webhooks.js";
import type { WebhookRequest } from "../../src/http/webhook-types.js";

function buildDeps(overrides: Record<string, unknown> = {}) {
  const logger = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  return {
    orchestrator: {
      requestTargetedRefresh: vi.fn(),
      stopWorkerForIssue: vi.fn(),
    },
    logger,
    configStore: {
      getConfig: vi.fn().mockReturnValue({ triggers: { rateLimitPerMinute: 30, githubSecret: "secret" } }),
    },
    tracker: {} as never,
    webhookHandlerDeps: {
      getWebhookSecret: vi.fn().mockReturnValue("linear-secret"),
      getPreviousWebhookSecret: vi.fn().mockReturnValue(null),
      requestRefresh: vi.fn(),
      requestTargetedRefresh: vi.fn(),
      stopWorkerForIssue: vi.fn(),
      recordVerifiedDelivery: vi.fn(),
      logger,
      webhookInbox: {
        insertVerified: vi.fn().mockResolvedValue({ isNew: true }),
      },
    },
    ...overrides,
  };
}

async function startApp(deps: ReturnType<typeof buildDeps>) {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as WebhookRequest).rawBody = buf;
      },
    }),
  );
  registerWebhookRoutes(app, deps as never);
  return await new Promise<{ server: ReturnType<typeof app.listen>; baseUrl: string }>((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe("registerWebhookRoutes", () => {
  const servers: Array<ReturnType<express.Express["listen"]>> = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  it("does not register provider webhook routes when webhook deps are missing", async () => {
    const deps = buildDeps({ webhookHandlerDeps: undefined });
    const { server, baseUrl } = await startApp(deps);
    servers.push(server);

    const linear = await fetch(`${baseUrl}/webhooks/linear`, { method: "POST" });
    const github = await fetch(`${baseUrl}/webhooks/github`, { method: "POST" });

    expect(linear.status).toBe(404);
    expect(github.status).toBe(404);
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it("registers provider webhook routes when webhook deps are available", async () => {
    const deps = buildDeps();
    const { server, baseUrl } = await startApp(deps);
    servers.push(server);

    const linear = await fetch(`${baseUrl}/webhooks/linear`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "linear-signature": "invalid",
      },
      body: JSON.stringify({ action: "Create", type: "Issue" }),
    });
    const github = await fetch(`${baseUrl}/webhooks/github`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "issues",
        "x-hub-signature-256": "invalid",
      },
      body: JSON.stringify({ action: "opened" }),
    });

    expect(linear.status).not.toBe(404);
    expect(github.status).not.toBe(404);
  });

  it("enforces POST-only webhook routes", async () => {
    const deps = buildDeps();
    const { server, baseUrl } = await startApp(deps);
    servers.push(server);

    const linear = await fetch(`${baseUrl}/webhooks/linear`);
    const github = await fetch(`${baseUrl}/webhooks/github`);

    expect(linear.status).toBe(405);
    expect(github.status).toBe(405);
  });

  it("accepts trigger dispatch requests on the API webhook route", async () => {
    const deps = buildDeps();
    const { server, baseUrl } = await startApp(deps);
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/v1/webhooks/trigger`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "re_poll" }),
    });

    expect([200, 202, 503]).toContain(response.status);
  });
});
