import winston from "winston";

import type { SymphonyLogger } from "./types.js";

function normalizeArgs(meta: unknown, message?: string): { message?: string; meta?: unknown } {
  if (typeof meta === "string" && message === undefined) {
    return { message: meta };
  }

  return { message, meta };
}

class WinstonSymphonyLogger implements SymphonyLogger {
  constructor(private readonly logger: winston.Logger) {}

  debug(meta: unknown, message?: string): void {
    const normalized = normalizeArgs(meta, message);
    this.logger.debug(normalized.message ?? "", normalized.meta);
  }

  info(meta: unknown, message?: string): void {
    const normalized = normalizeArgs(meta, message);
    this.logger.info(normalized.message ?? "", normalized.meta);
  }

  warn(meta: unknown, message?: string): void {
    const normalized = normalizeArgs(meta, message);
    this.logger.warn(normalized.message ?? "", normalized.meta);
  }

  error(meta: unknown, message?: string): void {
    const normalized = normalizeArgs(meta, message);
    this.logger.error(normalized.message ?? "", normalized.meta);
  }

  child(meta: Record<string, unknown>): SymphonyLogger {
    return new WinstonSymphonyLogger(this.logger.child(meta));
  }
}

export function createLogger(): SymphonyLogger {
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL ?? "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.printf((info) => {
        const parts = [`level=${info.level}`];
        if (info.message) {
          parts.push(`msg=${JSON.stringify(info.message)}`);
        }
        if (info.timestamp) {
          parts.push(`time=${info.timestamp}`);
        }

        const rest = { ...info } as Record<string, unknown>;
        delete rest.level;
        delete rest.message;
        delete rest.timestamp;

        for (const [key, value] of Object.entries(rest)) {
          if (value === undefined) {
            continue;
          }
          parts.push(`${key}=${JSON.stringify(value)}`);
        }

        return parts.join(" ");
      }),
    ),
    transports: [new winston.transports.Console()],
  });

  return new WinstonSymphonyLogger(logger);
}
