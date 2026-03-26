import { describe, it, expect, beforeEach, afterEach } from "vitest";
import winston from "winston";

import { createLogger, resolveLogFormat } from "../../src/core/logger.js";

/**
 * Winston transport that captures formatted log output for assertions.
 * Uses `Symbol.for("message")` — the key Winston writes the final string to.
 */
class CaptureTransport extends winston.transports.Stream {
  readonly lines: string[] = [];

  constructor() {
    super({ stream: process.stdout });
  }

  override log(info: Record<string | symbol, unknown>, next: () => void): void {
    const formatted = info[Symbol.for("message")];
    if (typeof formatted === "string") {
      this.lines.push(formatted);
    }
    next();
  }
}

/** Create a winston logger that captures output for test inspection. */
function createTestLogger(level = "info"): { logger: winston.Logger; transport: CaptureTransport } {
  const transport = new CaptureTransport();
  const logger = winston.createLogger({
    level,
    format: resolveLogFormat(),
    transports: [transport],
  });
  return { logger, transport };
}

describe("logger", () => {
  const savedLogFormat = process.env.SYMPHONY_LOG_FORMAT;
  const savedLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    delete process.env.SYMPHONY_LOG_FORMAT;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    process.env.SYMPHONY_LOG_FORMAT = savedLogFormat;
    process.env.LOG_LEVEL = savedLogLevel;
  });

  describe("resolveLogFormat", () => {
    it("returns logfmt format by default (no env var)", () => {
      const format = resolveLogFormat();
      expect(format).toBeDefined();
    });

    it("returns JSON format when SYMPHONY_LOG_FORMAT=json", () => {
      process.env.SYMPHONY_LOG_FORMAT = "json";
      const format = resolveLogFormat();
      expect(format).toBeDefined();
    });

    it("returns logfmt format for unknown SYMPHONY_LOG_FORMAT values", () => {
      process.env.SYMPHONY_LOG_FORMAT = "unknown";
      const format = resolveLogFormat();
      expect(format).toBeDefined();
    });
  });

  describe("default format (logfmt)", () => {
    it("produces logfmt-style output", () => {
      const { logger, transport } = createTestLogger();

      logger.info("hello world");

      expect(transport.lines).toHaveLength(1);
      const line = transport.lines[0];
      expect(line).toContain("level=info");
      expect(line).toContain('msg="hello world"');
      expect(line).toMatch(/time=\d{4}-\d{2}-\d{2}/);
    });

    it("includes metadata fields as key=value pairs", () => {
      const { logger, transport } = createTestLogger();

      logger.info("test", { component: "http", requestId: "abc-123" });

      const line = transport.lines[0];
      expect(line).toContain("level=info");
      expect(line).toContain('component="http"');
      expect(line).toContain('requestId="abc-123"');
    });
  });

  describe("JSON format", () => {
    beforeEach(() => {
      process.env.SYMPHONY_LOG_FORMAT = "json";
    });

    it("produces valid JSON output", () => {
      const { logger, transport } = createTestLogger();

      logger.info("structured log entry");

      expect(transport.lines).toHaveLength(1);
      const parsed = JSON.parse(transport.lines[0]);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("structured log entry");
      expect(parsed.timestamp).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it("includes metadata fields in JSON output", () => {
      const { logger, transport } = createTestLogger();

      logger.info("request handled", { requestId: "req-456", statusCode: 200 });

      const parsed = JSON.parse(transport.lines[0]);
      expect(parsed.requestId).toBe("req-456");
      expect(parsed.statusCode).toBe(200);
      expect(parsed.message).toBe("request handled");
    });

    it("child loggers produce JSON with inherited metadata", () => {
      const { logger, transport } = createTestLogger();

      const child = logger.child({ component: "orchestrator" });
      child.info("child message", { issueId: "ISS-1" });

      const parsed = JSON.parse(transport.lines[0]);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("child message");
      expect(parsed.component).toBe("orchestrator");
      expect(parsed.issueId).toBe("ISS-1");
    });

    it("includes all standard log levels", () => {
      const { logger, transport } = createTestLogger("debug");

      logger.debug("debug msg");
      logger.info("info msg");
      logger.warn("warn msg");
      logger.error("error msg");

      expect(transport.lines).toHaveLength(4);
      const levels = transport.lines.map((line) => JSON.parse(line).level);
      expect(levels).toEqual(["debug", "info", "warn", "error"]);
    });
  });

  describe("createLogger integration", () => {
    it("creates a logger with default format", () => {
      const logger = createLogger();
      expect(logger).toBeDefined();
      expect(logger.info).toBeTypeOf("function");
      expect(logger.child).toBeTypeOf("function");
    });

    it("creates a logger with JSON format", () => {
      process.env.SYMPHONY_LOG_FORMAT = "json";
      const logger = createLogger();
      expect(logger).toBeDefined();
      expect(logger.info).toBeTypeOf("function");
    });

    it("child logger inherits the SymphonyLogger interface", () => {
      const logger = createLogger();
      const child = logger.child({ component: "test" });
      expect(child.debug).toBeTypeOf("function");
      expect(child.info).toBeTypeOf("function");
      expect(child.warn).toBeTypeOf("function");
      expect(child.error).toBeTypeOf("function");
      expect(child.child).toBeTypeOf("function");
    });
  });
});
