import http from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotificationEvent } from "../../src/notification/channel.js";
import { SlackWebhookChannel } from "../../src/notification/slack-webhook.js";

function baseEvent(overrides?: Partial<NotificationEvent>): NotificationEvent {
  return {
    type: "worker_failed",
    severity: "critical",
    timestamp: "2026-03-17T02:00:00.000Z",
    message: "worker crashed while applying patch",
    issue: {
      id: "issue-1",
      identifier: "MT-42",
      title: "Fix flaky test",
      state: "In Progress",
      url: "https://linear.app/example/issue/MT-42",
    },
    attempt: 3,
    metadata: {
      errorCode: "turn_failed",
      runId: "run-123",
    },
    ...overrides,
  };
}

interface CapturedRequest {
  method: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

async function startWebhookServer(
  statusCode: number,
  body = "ok",
): Promise<{ url: string; requests: CapturedRequest[]; close: () => Promise<void> }> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => {
      requests.push({
        method: request.method ?? "GET",
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      response.statusCode = statusCode;
      response.end(body);
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve(address.port);
        return;
      }
      reject(new Error("failed to resolve webhook port"));
    });
    server.once("error", reject);
  });

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

describe("SlackWebhookChannel integration", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  it("skips delivery when verbosity suppresses the event", async () => {
    const server = await startWebhookServer(200);
    closers.push(server.close);
    const channel = new SlackWebhookChannel({
      webhookUrl: server.url,
      verbosity: "critical",
    });

    await channel.notify(baseEvent({ severity: "info", type: "worker_retry" }));

    expect(server.requests).toHaveLength(0);
  });

  it("posts a block payload to a real webhook endpoint", async () => {
    const server = await startWebhookServer(200);
    closers.push(server.close);
    const channel = new SlackWebhookChannel({
      webhookUrl: server.url,
      verbosity: "verbose",
    });

    await channel.notify(baseEvent());

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.method).toBe("POST");
    expect(server.requests[0]?.headers["content-type"]).toBe("application/json; charset=utf-8");
    const payload = JSON.parse(server.requests[0]?.body ?? "{}");
    expect(payload.text).toContain("MT-42");
    expect(payload.attachments[0].blocks[0].type).toBe("header");
    expect(payload.attachments[0].blocks[2].text.text).toContain("worker crashed");
  });

  it("throws and logs when the webhook responds with a non-success status", async () => {
    const server = await startWebhookServer(503, "temporary upstream outage");
    closers.push(server.close);
    const logger = { error: vi.fn() };
    const channel = new SlackWebhookChannel({
      webhookUrl: server.url,
      verbosity: "verbose",
      logger: logger as never,
    });

    await expect(channel.notify(baseEvent())).rejects.toThrow("status 503");
    expect(logger.error).toHaveBeenCalled();
  });
});
