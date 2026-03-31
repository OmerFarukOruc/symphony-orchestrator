import pino from "pino";
import { Writable } from "node:stream";

import type { RisolutoLogger } from "./types.js";

/** Fallback for Pino loggers that lack a custom level formatter. */
const PINO_LEVEL_LABELS: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

function normalizeArgs(meta: unknown, message?: string): { message?: string; meta?: Record<string, unknown> } {
  if (typeof meta === "string" && message === undefined) {
    return { message: meta };
  }

  if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
    return { message, meta: meta as Record<string, unknown> };
  }

  return { message };
}

/** Shared Pino options that match the field names Winston emitted. */
function basePinoOptions(): pino.LoggerOptions {
  return {
    level: process.env.LOG_LEVEL ?? "info",
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

/**
 * Build a Writable stream that re-formats Pino JSON output as logfmt.
 * Exported for testability.
 */
export function buildLogfmtStream(output: NodeJS.WritableStream = process.stdout): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding: string, callback: () => void) {
      const raw = chunk.toString();
      try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        const parts: string[] = [];

        const rawLevel = obj.level;
        const levelLabel =
          typeof rawLevel === "number" ? (PINO_LEVEL_LABELS[rawLevel] ?? String(rawLevel)) : String(rawLevel);
        parts.push(`level=${levelLabel}`);

        // message
        if (obj.message !== undefined) {
          parts.push(`msg=${JSON.stringify(obj.message)}`);
        }

        // timestamp
        if (obj.timestamp !== undefined) {
          parts.push(`time=${String(obj.timestamp)}`);
        }

        // remaining key=value pairs
        for (const [key, value] of Object.entries(obj)) {
          if (key === "level" || key === "message" || key === "timestamp") {
            continue;
          }
          if (value === undefined) {
            continue;
          }
          parts.push(`${key}=${JSON.stringify(value)}`);
        }

        output.write(parts.join(" ") + "\n");
      } catch {
        output.write(raw);
      }
      callback();
    },
  });
}

/** Resolve the log format from `RISOLUTO_LOG_FORMAT` env var. */
export function resolveLogFormat(): "json" | "logfmt" {
  const format = process.env.RISOLUTO_LOG_FORMAT;
  if (format === "json") {
    return "json";
  }
  return "logfmt";
}

class PinoRisolutoLogger implements RisolutoLogger {
  constructor(private readonly logger: pino.Logger) {}

  private log(level: "debug" | "info" | "warn" | "error", meta: unknown, message?: string): void {
    const normalized = normalizeArgs(meta, message);
    if (normalized.meta) {
      this.logger[level](normalized.meta, normalized.message ?? "");
    } else {
      this.logger[level](normalized.message ?? "");
    }
  }

  debug(meta: unknown, message?: string): void {
    this.log("debug", meta, message);
  }

  info(meta: unknown, message?: string): void {
    this.log("info", meta, message);
  }

  warn(meta: unknown, message?: string): void {
    this.log("warn", meta, message);
  }

  error(meta: unknown, message?: string): void {
    this.log("error", meta, message);
  }

  child(meta: Record<string, unknown>): RisolutoLogger {
    return new PinoRisolutoLogger(this.logger.child(meta));
  }
}

export function createLogger(): RisolutoLogger {
  const opts = basePinoOptions();

  const logger = resolveLogFormat() === "json" ? pino(opts) : pino(opts, buildLogfmtStream());

  return new PinoRisolutoLogger(logger);
}
