import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";

import { createLogger, resolveLogFormat, buildLogfmtStream } from "../../src/core/logger.js";

/** Capture stream that collects each written line for assertions. */
function createCaptureStream(): { stream: Writable; lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding: string, callback: () => void) {
      const text = chunk.toString().trim();
      if (text) lines.push(text);
      callback();
    },
  });
  return { stream, lines };
}

/** Shared Pino options matching the production config in logger.ts. */
function testPinoOptions(level = "info"): pino.LoggerOptions {
  return {
    level,
    messageKey: "message",
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    base: undefined,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };
}

/** Create a Pino logger that writes JSON to a capture stream. */
function createTestLogger(level = "info"): { logger: pino.Logger; lines: string[] } {
  const { stream, lines } = createCaptureStream();
  const logger = pino(testPinoOptions(level), stream);
  return { logger, lines };
}

/** Create a Pino logger that writes logfmt to a capture stream via buildLogfmtStream. */
function createLogfmtTestLogger(level = "info"): { logger: pino.Logger; lines: string[] } {
  const { stream, lines } = createCaptureStream();
  const logger = pino(testPinoOptions(level), buildLogfmtStream(stream));
  return { logger, lines };
}

describe("logger", () => {
  const savedLogFormat = process.env.RISOLUTO_LOG_FORMAT;
  const savedLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    delete process.env.RISOLUTO_LOG_FORMAT;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    process.env.RISOLUTO_LOG_FORMAT = savedLogFormat;
    process.env.LOG_LEVEL = savedLogLevel;
  });

  describe("resolveLogFormat", () => {
    it("returns logfmt by default (no env var)", () => {
      expect(resolveLogFormat()).toBe("logfmt");
    });

    it('returns "json" when RISOLUTO_LOG_FORMAT=json', () => {
      process.env.RISOLUTO_LOG_FORMAT = "json";
      expect(resolveLogFormat()).toBe("json");
    });

    it("returns logfmt for unknown RISOLUTO_LOG_FORMAT values", () => {
      process.env.RISOLUTO_LOG_FORMAT = "unknown";
      expect(resolveLogFormat()).toBe("logfmt");
    });
  });

  describe("default format (logfmt)", () => {
    it("produces logfmt-style output", () => {
      const { logger, lines } = createLogfmtTestLogger();

      logger.info("hello world");
      logger.flush();

      expect(lines.length).toBeGreaterThanOrEqual(1);
      const line = lines[0];
      expect(line).toContain("level=info");
      expect(line).toContain('msg="hello world"');
      expect(line).toMatch(/time=\d{4}-\d{2}-\d{2}/);
    });

    it("includes metadata fields as key=value pairs", () => {
      const { logger, lines } = createLogfmtTestLogger();

      logger.info({ component: "http", requestId: "abc-123" }, "test");
      logger.flush();

      expect(lines.length).toBeGreaterThanOrEqual(1);
      const line = lines[0];
      expect(line).toContain("level=info");
      expect(line).toContain('component="http"');
      expect(line).toContain('requestId="abc-123"');
    });
  });

  describe("JSON format", () => {
    it("produces valid JSON output", () => {
      const { logger, lines } = createTestLogger();

      logger.info("structured log entry");
      logger.flush();

      expect(lines.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("structured log entry");
      expect(parsed.timestamp).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it("includes metadata fields in JSON output", () => {
      const { logger, lines } = createTestLogger();

      logger.info({ requestId: "req-456", statusCode: 200 }, "request handled");
      logger.flush();

      const parsed = JSON.parse(lines[0]);
      expect(parsed.requestId).toBe("req-456");
      expect(parsed.statusCode).toBe(200);
      expect(parsed.message).toBe("request handled");
    });

    it("child loggers produce JSON with inherited metadata", () => {
      const { logger, lines } = createTestLogger();

      const child = logger.child({ component: "orchestrator" });
      child.info({ issueId: "ISS-1" }, "child message");
      logger.flush();

      const parsed = JSON.parse(lines[0]);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("child message");
      expect(parsed.component).toBe("orchestrator");
      expect(parsed.issueId).toBe("ISS-1");
    });

    it("includes all standard log levels", () => {
      const { logger, lines } = createTestLogger("debug");

      logger.debug("debug msg");
      logger.info("info msg");
      logger.warn("warn msg");
      logger.error("error msg");
      logger.flush();

      expect(lines).toHaveLength(4);
      const levels = lines.map((line) => JSON.parse(line).level);
      expect(levels).toEqual(["debug", "info", "warn", "error"]);
    });
  });

  describe("createLogger integration", () => {
    it("creates a logger with default format", () => {
      const logger = createLogger();
      expect(logger.info).toBeTypeOf("function");
      expect(logger.child).toBeTypeOf("function");
    });

    it("creates a logger with JSON format", () => {
      process.env.RISOLUTO_LOG_FORMAT = "json";
      const logger = createLogger();
      expect(logger.info).toBeTypeOf("function");
    });

    it("child logger inherits the RisolutoLogger interface", () => {
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
