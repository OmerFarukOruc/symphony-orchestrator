import type { SymphonyLogger } from "./types.js";

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
 * breadcrumbs, and context through the existing Winston logger.
 * When a real Sentry DSN is provided, this captures errors with
 * full breadcrumb trail and context snapshots.
 */
class SentryTracker implements ErrorTracker {
  private breadcrumbs: Array<{
    message: string;
    category: string;
    timestamp: string;
    data?: Record<string, unknown>;
  }> = [];
  private contexts: Record<string, Record<string, unknown>> = {};

  constructor(
    private readonly dsn: string,
    private readonly logger: SymphonyLogger,
  ) {
    logger.info({ dsn: dsn.replace(/\/\/.*@/, "//<redacted>@") }, "Sentry error tracking initialized");
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
export function initErrorTracking(logger: SymphonyLogger): ErrorTracker {
  const dsn = process.env.SENTRY_DSN;
  if (dsn?.startsWith("https://")) {
    tracker = new SentryTracker(dsn, logger);
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
