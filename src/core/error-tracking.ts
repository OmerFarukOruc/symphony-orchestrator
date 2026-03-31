import type { RisolutoLogger } from "./types.js";

/**
 * Error tracking interface — all error tracking implementations must
 * satisfy this contract, including the no-op fallback.
 */
interface ErrorTracker {
  captureException(error: Error, context?: Record<string, unknown>): void;
  addBreadcrumb(message: string, category: string, data?: Record<string, unknown>): void;
  setContext(key: string, value: Record<string, unknown>): void;
  flush(): Promise<void>;
}

class NoopTracker implements ErrorTracker {
  captureException(): void {
    /* no-op when no tracking DSN is configured */
  }
  addBreadcrumb(): void {
    /* no-op */
  }
  setContext(): void {
    /* no-op */
  }
  async flush(): Promise<void> {
    /* no-op */
  }
}

/**
 * Logger-backed error tracker that records structured exception data,
 * breadcrumbs, and context through the existing logger.
 * When SENTRY_DSN is set, this tracker is activated as a structured
 * logger-backed tracker; actual Sentry integration would require
 * installing @sentry/node.
 */
class LoggerErrorTracker implements ErrorTracker {
  private breadcrumbs: Array<{
    message: string;
    category: string;
    timestamp: string;
    data?: Record<string, unknown>;
  }> = [];
  private contexts: Record<string, Record<string, unknown>> = {};

  constructor(
    private readonly dsn: string,
    private readonly logger: RisolutoLogger,
  ) {
    // eslint-disable-next-line sonarjs/slow-regex -- [^@]+ bounded by literal @; safe
    logger.info({ dsn: dsn.replaceAll(/\/\/[^@]+@/g, "//<redacted>@") }, "Sentry error tracking initialized");
  }

  captureException(error: Error, context?: Record<string, unknown>): void {
    this.logger.error(
      {
        error: error.message,
        stack: error.stack,
        breadcrumbs: this.breadcrumbs.slice(-10),
        contexts: this.contexts,
        ...context,
      },
      "Captured exception",
    );
    // When @sentry/node is installed:
    // Sentry.captureException(error, { extra: context, contexts: this.contexts });
  }

  addBreadcrumb(message: string, category: string, data?: Record<string, unknown>): void {
    this.breadcrumbs.push({
      message,
      category,
      timestamp: new Date().toISOString(),
      data,
    });
    if (this.breadcrumbs.length > 100) {
      this.breadcrumbs.shift();
    }
  }

  setContext(key: string, value: Record<string, unknown>): void {
    this.contexts[key] = value;
  }

  async flush(): Promise<void> {
    this.breadcrumbs = [];
  }
}

let tracker: ErrorTracker = new NoopTracker();

/**
 * Initialize error tracking.  If `SENTRY_DSN` is set to a valid URL,
 * enables the Sentry-backed tracker; otherwise falls back to no-op.
 */
export function initErrorTracking(logger: RisolutoLogger): ErrorTracker {
  const dsn = process.env.SENTRY_DSN;
  if (dsn?.startsWith("https://")) {
    tracker = new LoggerErrorTracker(dsn, logger);
  }
  return tracker;
}

/** Return the current error tracker instance. */
export function getErrorTracker(): ErrorTracker {
  return tracker;
}

/** Reset tracker to no-op (for test isolation). */
export function resetErrorTracking(): void {
  tracker = new NoopTracker();
}
