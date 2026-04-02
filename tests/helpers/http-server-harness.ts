/**
 * Shared HTTP server test harness.
 *
 * Provides a two-tier setup for integration tests that need a real `HttpServer`
 * backed by a temp SQLite database, dynamic port allocation, and proper cleanup.
 *
 * **Tier 1 (default):** All `OrchestratorPort` methods return empty/null stubs.
 * No webhook deps, no event bus wiring. Suitable for contract tests and basic
 * HTTP route validation.
 *
 * **Tier 2 (opt-in layers):** Independently composable via `overrides`:
 *   - **Event bus layer:** pass `eventBus` or let the harness create one.
 *   - **Webhook layer:** pass `webhookDeps` with a configurable secret.
 *   - **Real SQLite layer:** wire `SqliteAttemptStore`, `SqliteWebhookInbox`, etc.
 */

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { vi } from "vitest";

import { TypedEventBus } from "../../src/core/event-bus.js";
import type { RisolutoEventMap } from "../../src/core/risoluto-events.js";
import type { RisolutoLogger } from "../../src/core/types.js";
import { HttpServer } from "../../src/http/server.js";
import type { WebhookHandlerDeps } from "../../src/http/webhook-handler.js";
import type { ConfigOverlayPort } from "../../src/config/overlay.js";
import type { ConfigStore } from "../../src/config/store.js";
import type { OrchestratorPort } from "../../src/orchestrator/port.js";
import { closeDatabase, openDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import type { SecretsStore } from "../../src/secrets/store.js";

/* ------------------------------------------------------------------ */
/*  Stub builders                                                      */
/* ------------------------------------------------------------------ */

/**
 * Build a Tier-1 stub orchestrator where every method returns a safe no-op
 * value. Individual methods can be overridden by the caller.
 */
export function buildStubOrchestrator(overrides: Partial<OrchestratorPort> = {}): OrchestratorPort {
  return {
    start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    requestRefresh: vi.fn().mockReturnValue({
      queued: false,
      coalesced: false,
      requestedAt: new Date().toISOString(),
    }),
    requestTargetedRefresh: vi.fn(),
    stopWorkerForIssue: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue({
      generatedAt: new Date().toISOString(),
      counts: { running: 0, retrying: 0 },
      running: [],
      retrying: [],
      queued: [],
      completed: [],
      workflowColumns: [],
      codexTotals: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        secondsRunning: 0,
        costUsd: 0,
      },
      rateLimits: null,
      recentEvents: [],
    }),
    getSerializedState: vi.fn().mockReturnValue({
      generated_at: new Date().toISOString(),
      counts: { running: 0, retrying: 0 },
      running: [],
      retrying: [],
      queued: [],
      completed: [],
      workflow_columns: [],
      codex_totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        seconds_running: 0,
        cost_usd: 0,
      },
      rate_limits: null,
      recent_events: [],
    }),
    getIssueDetail: vi.fn().mockReturnValue(null),
    getAttemptDetail: vi.fn().mockReturnValue(null),
    abortIssue: vi.fn().mockReturnValue({ ok: false, code: "not_found", message: "stub" }),
    updateIssueModelSelection: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    steerIssue: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    getTemplateOverride: vi.fn().mockReturnValue(null),
    updateIssueTemplateOverride: vi.fn().mockReturnValue(false),
    clearIssueTemplateOverride: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

/**
 * Build a silent logger that swallows all output (avoids noise in tests).
 */
export function buildSilentLogger(): RisolutoLogger {
  const noop = vi.fn();
  const logger: RisolutoLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: vi.fn().mockReturnValue(undefined as unknown as RisolutoLogger),
  };
  // child() should return the same silent shape
  (logger.child as ReturnType<typeof vi.fn>).mockReturnValue(logger);
  return logger;
}

const DEFAULT_WEBHOOK_SECRET = "test-webhook-secret";

/**
 * Build Tier-2 webhook handler deps with configurable stubs.
 * Follows the `makeDeps()` pattern from `webhook-handler.test.ts`.
 */
export function buildWebhookDeps(overrides: Partial<WebhookHandlerDeps> = {}): WebhookHandlerDeps {
  return {
    getWebhookSecret: vi.fn().mockReturnValue(DEFAULT_WEBHOOK_SECRET),
    getPreviousWebhookSecret: vi.fn().mockReturnValue(null),
    requestRefresh: vi.fn(),
    requestTargetedRefresh: vi.fn(),
    stopWorkerForIssue: vi.fn(),
    recordVerifiedDelivery: vi.fn(),
    logger: buildSilentLogger(),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Harness types                                                      */
/* ------------------------------------------------------------------ */

export interface TestServerOverrides {
  /** Override the orchestrator (Tier 1 stub used when omitted). */
  orchestrator?: OrchestratorPort;
  /** Override the logger (silent logger used when omitted). */
  logger?: RisolutoLogger;
  /** Provide or enable a real event bus (Tier 2). `true` creates one automatically. */
  eventBus?: TypedEventBus<RisolutoEventMap> | true;
  /** Provide webhook handler deps (Tier 2). `true` builds default stubs. */
  webhookDeps?: WebhookHandlerDeps | true;
  /** Webhook signing secret (used when `webhookDeps` is `true`). */
  webhookSecret?: string;
  /** Whether to open a real SQLite database in the temp dir (Tier 2). */
  withDatabase?: boolean;
  /** Path to a directory containing a built frontend (index.html). */
  frontendDir?: string;
  /** Provide a config store for config/transitions routes (Tier 2). */
  configStore?: ConfigStore;
  /** Provide a config overlay store for overlay CRUD routes (Tier 2). */
  configOverlayStore?: ConfigOverlayPort;
  /** Provide a secrets store for secrets CRUD routes (Tier 2). */
  secretsStore?: SecretsStore;
}

export interface TestServerResult {
  /** The running HttpServer instance. */
  server: HttpServer;
  /** Base URL including the dynamically-allocated port (e.g. `http://127.0.0.1:54321`). */
  baseUrl: string;
  /** Path to the temp directory created for this test run. */
  dataDir: string;
  /** The SQLite database (only present when `withDatabase` is true). */
  db: RisolutoDatabase | null;
  /** The event bus (only present when `eventBus` override was provided). */
  eventBus: TypedEventBus<RisolutoEventMap> | null;
  /** The orchestrator used by the server (for assertion / spy access). */
  orchestrator: OrchestratorPort;
  /** The logger used by the server (for assertion / spy access). */
  logger: RisolutoLogger;
  /** Stop the server, close the DB, and remove the temp directory. */
  teardown: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Start a real `HttpServer` on a dynamic port backed by a temp directory
 * and (optionally) a real SQLite database.
 *
 * Call `teardown()` in your `afterEach` / `afterAll` to stop the server,
 * close the database, and clean up the temp directory.
 *
 * @example
 * ```ts
 * let ctx: TestServerResult;
 * beforeEach(async () => { ctx = await startTestServer(); });
 * afterEach(async () => { await ctx.teardown(); });
 *
 * it("returns 200 on /api/v1/state", async () => {
 *   const response = await fetch(`${ctx.baseUrl}/api/v1/state`);
 *   expect(response.status).toBe(200);
 * });
 * ```
 */
export async function startTestServer(overrides: TestServerOverrides = {}): Promise<TestServerResult> {
  /* ---- temp directory ---- */
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "risoluto-integration-test-"));

  /* ---- database (Tier 2) ---- */
  let db: RisolutoDatabase | null = null;
  if (overrides.withDatabase) {
    db = openDatabase(path.join(dataDir, "test.db"));
  }

  /* ---- event bus (Tier 2) ---- */
  let eventBus: TypedEventBus<RisolutoEventMap> | null = null;
  if (overrides.eventBus === true) {
    eventBus = new TypedEventBus<RisolutoEventMap>();
  } else if (overrides.eventBus) {
    eventBus = overrides.eventBus;
  }

  /* ---- webhook deps (Tier 2) ---- */
  let webhookHandlerDeps: WebhookHandlerDeps | undefined;
  if (overrides.webhookDeps === true) {
    webhookHandlerDeps = buildWebhookDeps(
      overrides.webhookSecret ? { getWebhookSecret: vi.fn().mockReturnValue(overrides.webhookSecret) } : {},
    );
  } else if (overrides.webhookDeps) {
    webhookHandlerDeps = overrides.webhookDeps;
  }

  /* ---- orchestrator ---- */
  const orchestrator = overrides.orchestrator ?? buildStubOrchestrator();

  /* ---- logger ---- */
  const logger = overrides.logger ?? buildSilentLogger();

  /* ---- server ---- */
  const server = new HttpServer({
    orchestrator,
    logger,
    eventBus: eventBus ?? undefined,
    webhookHandlerDeps,
    frontendDir: overrides.frontendDir,
    archiveDir: dataDir,
    configStore: overrides.configStore,
    configOverlayStore: overrides.configOverlayStore,
    secretsStore: overrides.secretsStore,
  });

  const { port } = await server.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  /* ---- teardown ---- */
  const teardown = async (): Promise<void> => {
    await server.stop();
    if (db) {
      closeDatabase(db);
    }
    eventBus?.destroy();
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  };

  return {
    server,
    baseUrl,
    dataDir,
    db,
    eventBus,
    orchestrator,
    logger,
    teardown,
  };
}
