# Testing Expansion Plan

**Goal:** Push Risoluto's test posture from "strong unit + mocked E2E" to "full-system coverage" — real integration tests, full-stack E2E, expanded visual baselines, enforced mutation thresholds, and OpenAPI contract validation.

**Oracle verdict:** Reorder from the original draft. Move full-stack E2E before visual expansion and mutation grind. The biggest risk right now is untested system boundaries, not mutation scores.

---

## Executive Summary

| Phase | What                                                   | CI Lane               | Risk Addressed                    |
| ----- | ------------------------------------------------------ | --------------------- | --------------------------------- |
| A     | Foundation: SQLite + OpenAPI contract + SSE contract   | PR gate               | Silent drift in DB and API layer  |
| B     | Full-stack E2E: real backend + real browser + real SSE | Nightly               | Frontend/backend integration seam |
| C     | Live provider smoke: Linear, GitHub, Docker            | Nightly/Manual        | Real API contract drift           |
| D     | Visual expansion: 25-30 baselines from 4               | Nightly               | UI regression in uncovered routes |
| E     | Mutation ratchet: 70 → 80 → 85 break                   | PR gate (incremental) | Test suite integrity              |

---

## Phase A — Foundation / Source of Truth

### A1. OpenAPI Spec Sync Test

**Problem:** `getOpenApiSpec()` (runtime-generated) and `docs-site/openapi.json` (checked-in) can silently drift. Version mismatch already confirmed: package at `0.6.0`, spec at `0.4.0`.

**File:** `tests/http/openapi-sync.test.ts`

```typescript
// Import runtime spec generator
import { getOpenApiSpec } from "../../src/http/openapi.js";
// Import checked-in spec
import checkedInSpec from "../../docs-site/openapi.json" assert { type: "json" };

it("runtime spec matches docs-site/openapi.json exactly", () => {
  expect(getOpenApiSpec()).toStrictEqual(checkedInSpec);
});
```

**Also required:** Tighten loose schemas in `src/http/openapi-paths.ts` before contract tests add value. Routes like `/api/v1/state` and `/api/v1/transitions` currently return `type: object` — these must have proper response schemas or contract tests will validate mush.

**CI Lane:** PR gate (unit test, no server needed).

---

### A2. SQLite Shared-Runtime Integration Tests

**Problem:** All 8 SQLite modules (`src/persistence/sqlite/`) have zero real DB integration coverage. Unit tests mock the store interfaces. The real risk is migrations, WAL behavior, restart persistence, and schema correctness.

**Files:**

- `tests/integration/sqlite-runtime.integration.test.ts` — bootstrap, migration, WAL, restart
- `tests/integration/sqlite-persistence.integration.test.ts` — all store modules end-to-end

**Key requirements from Oracle:**

- Use a **real temp file DB** — not `:memory:`. The `openDatabase()` function configures WAL and `PRAGMA journal_mode` which `:memory:` misses.
- Use `os.tmpdir()` + unique suffix per test, clean up in `afterEach`.

**Coverage targets:**

| Module                    | Integration Tests Needed                                                   |
| ------------------------- | -------------------------------------------------------------------------- |
| `database.ts`             | `openDatabase()` with WAL, close/reopen cycle, concurrent access guard     |
| `migrator.ts`             | Fresh migration, incremental migration, already-migrated idempotency       |
| `runtime.ts`              | Full bootstrap: seed defaults, JSONL migration path, shared runtime wiring |
| `attempt-store-sqlite.ts` | Create, get, update, list attempts; concurrent writes; query filters       |
| `issue-config-store.ts`   | Set/get/delete per-issue config; default fallback behavior                 |
| `webhook-inbox.ts`        | Enqueue, dequeue, dedup by delivery ID, expiry cleanup                     |
| `schema.ts`               | Schema inspection matches expected column definitions                      |

**Restart/recovery scenarios** (high value for an orchestrator):

- Persist attempt state → close DB → reopen → assert state survives
- Corrupt DB file → open fails gracefully
- Concurrent open attempt → second open blocks or errors predictably
- Write after close → clean error

**CI Lane:** PR gate. No external credentials needed.

---

### A3. AJV Response Contract Tests

**Problem:** 27 API endpoints, zero response validation against the OpenAPI schema. The spec exists and is served at `/api/v1/openapi.json` — it's never tested against actual responses.

**File:** `tests/http/openapi-contracts.integration.test.ts`

**Architecture:**

1. Start a real `HttpServer` with a temp-file SQLite DB (same harness as A2)
2. Import `getOpenApiSpec()` at test time
3. Compile each endpoint's response schema with AJV
4. Send real HTTP requests
5. Assert: status code, `Content-Type`, JSON schema validity

**All 27 endpoints to test:**

```
GET  /api/v1/state                     → RuntimeSnapshot schema
GET  /api/v1/runtime                   → RuntimeSnapshot schema
POST /api/v1/refresh                   → 204 or success schema
GET  /api/v1/models                    → ModelList schema
GET  /api/v1/transitions               → TransitionList schema
GET  /api/v1/openapi.json              → valid OpenAPI 3.1 object
GET  /api/docs                         → text/html (not JSON-validated, just 200)
GET  /metrics                          → text/plain Prometheus format (not JSON)

GET  /api/v1/:id                       → IssueDetail schema
POST /api/v1/:id/abort                 → success/error schema
POST /api/v1/:id/model                 → success schema
POST /api/v1/:id/template              → success schema
DELETE /api/v1/:id/template            → success schema
POST /api/v1/:id/transition            → success schema
POST /api/v1/:id/steer                 → success schema
GET  /api/v1/:id/attempts              → AttemptList schema
GET  /api/v1/attempts/:attempt_id      → AttemptDetail schema

GET  /api/v1/workspaces                → WorkspaceList schema
DELETE /api/v1/workspaces/:key         → 204 or success schema
GET  /api/v1/git/context               → GitContext schema
GET  /api/v1/config                    → Config schema
GET  /api/v1/config/schema             → JSONSchema object
GET  /api/v1/config/overlay            → ConfigOverlay schema
PUT  /api/v1/config/overlay            → success schema
PATCH /api/v1/config/overlay/:path     → success schema
DELETE /api/v1/config/overlay/:path    → success schema
GET  /api/v1/secrets                   → SecretsList schema
POST /api/v1/secrets/:key              → success schema
DELETE /api/v1/secrets/:key            → success schema
```

**Also test error responses:**

- `POST /api/v1/:id/model` with invalid body → 400 with error schema
- `GET /api/v1/unknown-issue` → 404 with error schema
- `POST /api/v1/:id/transition` with invalid transition → 422 with error schema

**CI Lane:** PR gate. Server starts with temp DB, no external dependencies.

---

### A4. SSE Contract Tests

**Problem:** The frontend's entire live-update model depends on the SSE event envelope shape at `/api/v1/events`. This is a critical integration seam that OpenAPI doesn't cover well and no test currently exercises.

**File:** `tests/http/sse-contracts.integration.test.ts`

**What to test:**

- Connect to `/api/v1/events` with `EventSource`
- Assert initial event is sent on connect (heartbeat or state snapshot)
- Trigger a state change via API → assert correct event type and payload shape arrive on SSE stream
- Disconnect + reconnect → assert no missed events, client recovers
- Assert event envelope schema: `{ type: string, payload: object }` matches frontend's `RisolutoEvent` type
- Assert `event-source.ts` reconnect logic handles server restart

**CI Lane:** PR gate.

---

### A5. Orchestrator Restart / Recovery / Idempotency Tests

**Problem:** As an autonomous orchestrator, Risoluto must handle duplicate webhook delivery, restart after crash, and abort/completion races. None of this is integration-tested today.

**File:** `tests/orchestrator/restart-recovery.integration.test.ts`

**Scenarios:**

- Webhook delivered twice (same `deliveryId`) → processed once only
- Orchestrator restarted mid-run → issue not re-dispatched (state read from DB)
- Abort + completion arrive simultaneously → deterministic winner
- Repeated `/api/v1/refresh` calls → coalesced, not multiplied
- Issue persisted as "in-progress" on crash → correct state on restart

**CI Lane:** PR gate. Uses real SQLite + in-process orchestrator, no external services.

---

## Phase B — Full-Stack E2E

**Problem:** Frontend (Playwright, mocked API) and backend (lifecycle script, real APIs) are tested in complete isolation. The SSE seam — where a webhook causes a backend state change that propagates to the browser via real SSE — is never tested at all.

### Architecture

**New Playwright project:** `fullstack` in `playwright.config.ts`

```typescript
{
  name: "fullstack",
  testMatch: ["**/*.fullstack.spec.ts"],
  use: { ...devices["Desktop Chrome"] },
  // No webServer override — uses global setup
}
```

**Global setup:** `tests/e2e/setup/fullstack-server.ts`

```
1. Build frontend: pnpm exec vite build --config frontend/vite.config.ts
2. Create temp data dir with unique suffix
3. Start real Risoluto HTTP server:
   - Points to temp SQLite DB
   - Serves built frontend at /
   - Serves /api/v1/* routes
   - Serves /api/v1/events SSE
   - Configures webhook secret
   - Uses mock tracker (local HTTP mock Linear server)
4. Start local mock Linear webhook sender (tiny Express server)
5. Seed one test issue into DB
6. Return { backendUrl, mockLinearPort }
```

**Key decision (per Oracle):** Do NOT use Vite dev server for full-stack tests. Serve the built frontend directly from the real Risoluto backend. This matches production shape exactly and avoids proxy weirdness.

### Test Files

**`tests/e2e/specs/fullstack/webhook-to-ui.fullstack.spec.ts`**

```
1. Browser opens Risoluto at backendUrl
2. POST signed webhook to /webhooks/linear (issue transitions to "In Progress")
3. Assert: browser's overview page reflects the state change
   - without page reload
   - via real SSE push
   - within 3 seconds
```

**`tests/e2e/specs/fullstack/issue-lifecycle.fullstack.spec.ts`**

```
1. POST webhook: issue picked up by agent (mocked Codex runner)
2. Assert: issue moves to "Running" state in UI
3. POST webhook: issue completes
4. Assert: issue moves to "Done" state in UI, attempt count incremented
```

**`tests/e2e/specs/fullstack/sse-reconnect.fullstack.spec.ts`**

```
1. Browser connects to SSE
2. Simulate server restart (stop + start backend)
3. Assert: browser EventSource reconnects
4. POST webhook after reconnect
5. Assert: browser still receives the update (no missed events)
```

**`tests/e2e/specs/fullstack/api-error-handling.fullstack.spec.ts`**

```
1. Browser navigates to issue that doesn't exist
2. Assert: correct 404 error state rendered
3. POST to abort a non-running issue
4. Assert: correct error message shown in UI
```

**CI Lane:** Nightly. Full-stack E2E is too slow for every PR (requires build + server startup). Use GitHub Actions schedule trigger.

---

## Phase C — Live Provider Smoke Tests

**Architecture (per Oracle 3-lane model):**

- **Lane 1** (Phase A): Deterministic in-process mocks — PR CI
- **Lane 2** (Phase C): Thin live smoke tests — nightly/credential-gated
- **Lane 3** (existing): Full lifecycle script — manual/release

### C1. Linear Live Smoke

**File:** `tests/integration/linear-live.integration.test.ts`

**Guard:**

```typescript
const hasCredentials = !!process.env.LINEAR_API_KEY && !!process.env.LINEAR_TEST_TEAM_ID;
beforeAll(() => {
  if (!hasCredentials) return void it.skip("credentials absent");
});
```

**Operations (with full cleanup):**

1. Auth check: verify API key is valid, fetch viewer identity
2. Query issues: fetch issues from test team, validate response shape
3. Issue lifecycle: create issue → transition → add comment → delete (cleanup)
4. Pagination: request page 2, verify cursor behavior
5. Webhook: register webhook URL → verify → deregister (if admin scope available)

### C2. GitHub Live Smoke

**File:** `tests/integration/github-live.integration.test.ts`

**Guard:** `GITHUB_TOKEN` + `GITHUB_TEST_REPO` env vars

**Operations:**

1. Auth check: fetch authenticated user
2. Create draft PR in test repo
3. Detect duplicate PR (create same branch twice) → assert dedup logic triggers
4. Add comment to PR
5. Fetch PR status
6. Cleanup: close PR + delete branch

### C3. Docker Live Smoke

**File:** `tests/integration/docker-live.integration.test.ts`

**Guard:** `DOCKER_TEST_ENABLED=true` + Docker socket accessible

**Operations:**

1. Spawn minimal container (`alpine:latest echo hello`)
2. Assert startup, stdout capture, exit code
3. Verify cleanup: container removed after run
4. Test mount behavior: workspace dir mounted, file written by container is accessible
5. Stats collection: verify `dockerStats()` returns valid metrics during run

**CI Lane:** All three run nightly with credentials injected from GitHub Actions secrets. Skip gracefully on PR builds.

---

## Phase D — Visual Baseline Expansion

**Current:** 4 baselines covering overview, queue, settings, setup.
**Target:** 25–30 baselines covering all operator-critical routes + empty/error states.

**Principle (per Oracle):** Cover **operator-critical routes** and **empty/error states** — not every route blindly.

### New Visual Spec Files

| File                            | Route(s)                     | Baselines              | Priority |
| ------------------------------- | ---------------------------- | ---------------------- | -------- |
| `issue-detail.visual.spec.ts`   | `/issues/:id`                | 2 (running, completed) | High     |
| `attempt-detail.visual.spec.ts` | `/attempts/:id`              | 2 (success, failed)    | High     |
| `empty-states.visual.spec.ts`   | overview, queue (empty)      | 3                      | High     |
| `error-states.visual.spec.ts`   | 404, API error, timeout      | 3                      | High     |
| `observability.visual.spec.ts`  | `/observability`             | 2                      | Medium   |
| `workspaces.visual.spec.ts`     | `/workspaces`, `/containers` | 2                      | Medium   |
| `templates.visual.spec.ts`      | `/templates`                 | 2                      | Medium   |
| `audit.visual.spec.ts`          | `/audit`                     | 2                      | Low      |
| `settings-tabs.visual.spec.ts`  | Settings each tab            | 3                      | Low      |

**Total additions:** ~21 new baselines → total ~25 baselines.

**What's intentionally excluded:**

- `/logs/:id` — real-time log stream, non-deterministic visually
- `/issues/:id/logs` — same reason
- Responsive breakpoints — separate task, not this phase
- Dark mode — separate task

**Clock freezing and animation suppression required for all new visual tests** (same pattern as existing specs: `freezeClock(page)` + `installScreenshotCss(page)`).

**CI Lane:** Nightly. Visual diffs are deterministic but the suite is slow.

---

## Phase E — Mutation Ratchet

### E1. Expand Mutation Targets

Add to `stryker.config.json` `mutate` array:

```json
// HTTP layer (new)
"src/http/routes.ts",
"src/http/webhook-handler.ts",
"src/http/sse.ts",
"src/http/validation.ts",
"src/http/transitions-api.ts",
"src/http/attempt-handler.ts",
"src/http/workspace-inventory.ts",

// Persistence (new) — worth adding once integration tests exist
"src/persistence/sqlite/attempt-store-sqlite.ts",
"src/persistence/sqlite/issue-config-store.ts",
"src/persistence/sqlite/webhook-inbox.ts",
"src/persistence/sqlite/migrator.ts",

// External clients (new)
"src/linear/client.ts",
"src/linear/issue-pagination.ts",
"src/github/github-pr-client.ts",

// Secrets and notification (new)
"src/secrets/db-store.ts",
"src/notification/manager.ts",

// Setup logic (new)
"src/setup/validate.ts",
"src/setup/detect-default-branch.ts"
```

**Do NOT add:** CLI entry points, type-only files, integration-level files, Docker spawn (subprocess glue).

### E2. Enforce Break Threshold Progressively

```json
// E1 — after expanding targets and running full pass:
"thresholds": { "high": 80, "low": 60, "break": 70 }

// E2 — after killing surviving mutants from new targets:
"thresholds": { "high": 85, "low": 70, "break": 80 }

// E3 — final push:
"thresholds": { "high": 90, "low": 80, "break": 85 }
```

**Oracle's ceiling guidance:** 90–95% global is expensive and often rewards test contortions. The realistic sweet spot for a backend orchestrator is **80–85%** on curated targets. Normal survivor categories that are fine to leave: logging-only paths, metrics increments, retry jitter constants, defensive impossible branches, error message wording.

### E3. Kill Surviving Mutants

After each threshold raise, run `pnpm run test:mutation` (full pass), read `reports/stryker-report.html`, and add targeted test cases for meaningful survivors. The incremental file (`reports/stryker-incremental.json`) already persists which mutants are killed — only re-run changed files.

**CI Lane:** `pnpm run test:mutation:incremental` on every PR (fast — changed files only). Full pass runs nightly. Break threshold enforced on both.

---

## CI Lane Configuration

### PR Gate (every commit)

```yaml
# .github/workflows/ci.yml additions
- pnpm run build
- pnpm run lint
- pnpm run format:check
- pnpm test # unit tests
- pnpm run test:integration # A2 (SQLite), A3 (contracts), A4 (SSE), A5 (recovery)
- pnpm exec playwright test --project=smoke # existing smoke E2E
- pnpm run test:mutation:incremental # changed files only
- pnpm run typecheck:coverage # 95% type coverage
```

**New in this plan:** `test:integration` now runs real SQLite, OpenAPI contracts, SSE contracts, and orchestrator recovery tests. These are all CI-safe (no external credentials).

### Nightly

```yaml
# .github/workflows/nightly.yml
- All PR gate checks
- pnpm exec playwright test --project=fullstack # Phase B full-stack E2E
- pnpm exec playwright test --project=visual # Phase D visual regression
- pnpm run test:mutation # full mutation pass
- LINEAR_API_KEY=${{ secrets.LINEAR_API_KEY }} \
  pnpm run test:integration -- --reporter=verbose # Phase C live smoke (skips if no key)
- GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }} \
  DOCKER_TEST_ENABLED=true \
  pnpm run test:integration
```

### Manual / Release Canary

```bash
# Unchanged — existing full lifecycle script
./scripts/run-e2e.sh
```

---

## New Package Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test:integration:sqlite": "vitest run --config vitest.integration.config.ts tests/integration/sqlite-*.ts",
    "test:integration:contracts": "vitest run --config vitest.integration.config.ts tests/http/openapi-contracts.integration.test.ts tests/http/sse-contracts.integration.test.ts",
    "test:integration:live": "vitest run --config vitest.integration.config.ts tests/integration/*-live.integration.test.ts",
    "test:e2e:fullstack": "playwright test --project=fullstack",
    "test:all": "pnpm test && pnpm run test:integration && pnpm exec playwright test --project=smoke"
  }
}
```

---

## New Test Fixture: Real HTTP Server Harness

Many Phase A tests need a real running `HttpServer`. Extract this into a shared test fixture:

**File:** `tests/helpers/http-server-harness.ts`

```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HttpServer } from "../../src/http/server.js";
import { createTestConfig } from "./test-config-factory.js";

export interface ServerHarness {
  server: HttpServer;
  baseUrl: string;
  dataDir: string;
  teardown: () => Promise<void>;
}

export async function startTestServer(overrides?: Partial<TestConfig>): Promise<ServerHarness> {
  const dataDir = mkdtempSync(join(tmpdir(), "risoluto-test-"));
  const config = createTestConfig({ dataDir, ...overrides });
  // ... bootstrap real HttpServer with temp SQLite
  return { server, baseUrl: `http://127.0.0.1:${port}`, dataDir, teardown };
}
```

---

## Implementation Sequence

**Recommended execution order (can be parallelized by track):**

```
Week 1:
  Track A: A1 (spec sync) + A2 (SQLite integration) — foundation
  Track B: Tighten OpenAPI schemas (prerequisite for A3)

Week 2:
  Track A: A3 (AJV contract tests) + A4 (SSE contracts)
  Track B: A5 (restart/recovery)

Week 3:
  Track A: Phase B — full-stack E2E server harness + first 2 spec files
  Track B: Phase C — Linear + GitHub live smoke tests

Week 4:
  Track A: Phase B — remaining fullstack spec files
  Track B: Phase D — visual baseline expansion (high priority routes first)

Week 5:
  Track A: Phase E1 — expand mutation targets
  Track B: Phase E2 — kill surviving mutants from new targets + set break: 70

Week 6:
  Phase E3 — full mutation pass + set break: 80
  Full CI lane review — verify nightly pipeline works end to end
```

---

## Success Criteria

| Metric                     | Current           | Target                                                    |
| -------------------------- | ----------------- | --------------------------------------------------------- |
| True integration tests     | 0                 | ~50 test cases across SQLite + contracts + SSE + recovery |
| Full-stack E2E specs       | 0                 | 4 spec files, ~15 test cases                              |
| Live provider smoke tests  | 0 (guard-only)    | 3 files (Linear, GitHub, Docker), ~20 test cases          |
| Visual baselines           | 4                 | ~25–30                                                    |
| OpenAPI contract coverage  | 0/27 endpoints    | 27/27 endpoints                                           |
| Mutation `break` threshold | null (unenforced) | 80 (enforced in CI)                                       |
| Mutation file coverage     | 44/196 src files  | ~65/196 src files (curated)                               |
| CI runtime (PR gate)       | ~3 min            | ~5 min (+integration layer)                               |
| CI runtime (nightly)       | ~8 min            | ~25 min (+fullstack E2E + mutation)                       |
