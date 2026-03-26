import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { createPinoLogger } from "../../src/core/pino-logger.js";
import { runWithRequestContext } from "../../src/observability/tracing.js";

function createBufferedLogger() {
  const stream = new PassThrough();
  let output = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    output += chunk;
  });

  return {
    logger: createPinoLogger(stream),
    flush: async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return output
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

describe("PinoSymphonyLogger", () => {
  it("emits JSON logs with preserved message and key=value metadata", async () => {
    const { logger, flush } = createBufferedLogger();

    logger.info({ component: "http" }, "request completed issue=MT-42 status=ok");

    await expect(flush()).resolves.toEqual([
      expect.objectContaining({
        level: "info",
        msg: "request completed issue=MT-42 status=ok",
        component: "http",
        issue: "MT-42",
        status: "ok",
      }),
    ]);
  });

  it("includes request-id correlation and child bindings", async () => {
    const { logger, flush } = createBufferedLogger();

    runWithRequestContext("req-123", () => {
      logger.child({ component: "http" }).info({ route: "/api/v1/state" }, "served state");
    });

    await expect(flush()).resolves.toEqual([
      expect.objectContaining({
        level: "info",
        msg: "served state",
        request_id: "req-123",
        component: "http",
        route: "/api/v1/state",
      }),
    ]);
  });
});
