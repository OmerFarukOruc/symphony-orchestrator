import { describe, it, expect, vi } from "vitest";
import http from "node:http";
import { createDataPlaneServer } from "../../src/dispatch/server.js";
import type { IncomingMessage } from "node:http";

// Mock dependencies
vi.mock("../../src/core/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

vi.mock("../../src/agent-runner/index.js", () => ({
  AgentRunner: class {
    async runAttempt() {
      return {
        kind: "normal" as const,
        errorCode: null,
        errorMessage: null,
        threadId: "thread-1",
        turnId: "turn-1",
        turnCount: 1,
      };
    }
  },
}));

// Helper to make requests to the Express app
async function makeRequest(
  app: ReturnType<typeof createDataPlaneServer>,
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      if (typeof address !== "object" || !address) {
        server.close();
        reject(new Error("Failed to get server address"));
        return;
      }

      const port = address.port;

      const bodyString = options.body ? JSON.stringify(options.body) : "";
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(bodyString),
            ...options.headers,
          },
        },
        (res: IncomingMessage) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(res.headers)) {
              headers[key] = Array.isArray(value) ? value[0] : (value ?? "");
            }
            try {
              resolve({
                status: res.statusCode ?? 0,
                body: data ? JSON.parse(data) : null,
                headers,
              });
            } catch {
              resolve({ status: res.statusCode ?? 0, body: data, headers });
            } finally {
              server.close();
            }
          });
        },
      );

      req.on("error", (err) => {
        server.close();
        reject(err);
      });

      req.write(bodyString);
      req.end();
    });
  });
}

describe("Data plane server", () => {
  const secret = "test-secret";

  describe("GET /health", () => {
    it("returns 200 without auth", async () => {
      const app = createDataPlaneServer(secret);
      const response = await makeRequest(app, "GET", "/health");
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
    });
  });

  describe("POST /dispatch", () => {
    it("returns 401 without auth", async () => {
      const app = createDataPlaneServer(secret);
      const response = await makeRequest(app, "POST", "/dispatch", { body: {} });
      expect(response.status).toBe(401);
    });

    it("returns 401 with wrong auth", async () => {
      const app = createDataPlaneServer(secret);
      const response = await makeRequest(app, "POST", "/dispatch", {
        body: {},
        headers: { Authorization: "Bearer wrong-secret" },
      });
      expect(response.status).toBe(401);
    });

    it("returns 400 with missing required fields", async () => {
      const app = createDataPlaneServer(secret);
      const response = await makeRequest(app, "POST", "/dispatch", {
        body: {},
        headers: { Authorization: `Bearer ${secret}` },
      });
      expect(response.status).toBe(400);
    });
  });

  describe("POST /dispatch/:runId/abort", () => {
    it("returns 401 without auth", async () => {
      const app = createDataPlaneServer(secret);
      const response = await makeRequest(app, "POST", "/dispatch/test-id/abort");
      expect(response.status).toBe(401);
    });

    it("returns 404 for unknown run", async () => {
      const app = createDataPlaneServer(secret);
      const response = await makeRequest(app, "POST", "/dispatch/unknown-run-id/abort", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      expect(response.status).toBe(404);
    });
  });
});
