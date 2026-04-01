---
plan: "feat: Testing expansion -- integration, full-stack E2E, visual, mutation"
round: 1
mode: review
model: claude-opus-4-6
date: 2026-04-01
previous: null
verdict: CONDITIONAL GO
confidence: 82%
overall_score: 7/10
---

## What Works

The plan is well-grounded in the actual codebase. It correctly identifies the existing test patterns (temp dir management in `database.test.ts`, dynamic port via `server.start(0)`, SSE stream reading in `sse.test.ts`) and builds on them rather than inventing new conventions. The phased dependency graph is sound -- schema tightening genuinely blocks contract tests, the shared harness genuinely gates downstream integration work. The decision to use direct webhook injection over a mock Linear server is pragmatic and correct.

## Adversarial Critique

### C1. Webhook Signing Algorithm Error (Severity: HIGH)

The plan's "Resolved During Planning" section states tests should compute signatures with `createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex")`. This is **wrong**. The actual `verifyLinearSignature()` function (line 50 of `src/http/webhook-handler.ts`) operates on `rawBody: Buffer`, which is the raw bytes captured by the `express.json({ verify })` callback before parsing. `JSON.stringify(payload)` will not produce byte-identical output to the original raw body in all cases (key ordering, whitespace, Unicode escaping).

The existing test helper in `tests/http/webhook-handler.test.ts` does it correctly: `sign(body: string, secret)` where `body` is a string, and the `makeRequest()` helper passes a `rawBody` Buffer separately. The plan must specify: (1) serialize the payload to a string, (2) compute HMAC on that exact string, (3) set that same string as the rawBody Buffer on the request, (4) set the digest as the `Linear-Signature` header. Getting this wrong means every webhook integration test fails with 401.

### C2. Endpoint Count Claim is Wrong (Severity: MEDIUM)

The plan claims "27 API endpoints" throughout (R5, SC5, Unit 5 test scenarios). The actual count from `routes.ts` plus extension APIs is significantly higher:

- `routes.ts` core: ~22 route registrations
- `config/api.ts`: 4 routes (config, config/schema, config/overlay, config/overlay/:path) with multiple methods
- `secrets/api.ts`: 2 routes (secrets, secrets/:key) with multiple methods
- `setup/api.ts`: 18 routes
- `prompt/api.ts`: 3 routes (templates, templates/:id, templates/:id/preview)
- `audit/api.ts`: 1 route

The total is roughly **50+ distinct route-method combinations**, not 27. This matters because:
- Unit 5 claims to cover "all 27 API endpoints" -- it does not list setup, template, or audit endpoints
- SC5 claims "27/27 API endpoints validated" -- this success criterion is based on the wrong denominator
- The effort estimate for Unit 5 is understated if it actually needs to cover 50+ endpoints

The plan should either (a) scope contract tests to the core API and explicitly exclude setup/template/audit with justification, or (b) update the count and expand the test scenarios.

### C3. `github-pr-client.ts` Does Not Exist (Severity: MEDIUM)

Unit 12 lists `src/github/github-pr-client.ts` as a mutation target. This file does not exist. The actual GitHub client is `src/github/issues-client.ts`. This will cause Stryker to fail with a file-not-found error when the expanded mutate array is configured.

### C4. `setup/validate.ts` Does Not Exist (Severity: MEDIUM)

Unit 12 lists `src/setup/validate.ts` as a mutation target. This file does not exist. The setup directory contains `api.ts`, `detect-default-branch.ts`, `device-auth.ts`, `setup-handlers.ts`, `setup-status.ts`, `repo-route-handlers.ts`, and 12 handler files under `handlers/`. The plan should specify which of these are appropriate mutation targets.

### C5. Event Bus Has 13 Channels, Not 12 (Severity: LOW)

The plan states "12 event channels" in the Context & Research section. `RisolutoEventMap` in `src/core/risoluto-events.ts` actually defines 13 channels: `issue.started`, `issue.completed`, `issue.stalled`, `issue.queued`, `worker.failed`, `model.updated`, `workspace.event`, `agent.event`, `poll.complete`, `system.error`, `audit.mutation`, `webhook.received`, `webhook.health_changed`. Minor but indicates incomplete codebase reading.

### C6. Shared Harness Constructor Complexity Underspecified (Severity: HIGH)

The `HttpServer` constructor (lines 29-45 of `server.ts`) requires an `OrchestratorPort` which has a rich interface with 13 methods including `start()`, `stop()`, `requestRefresh()`, `getSnapshot()`, `getIssueDetail()`, `getAttemptDetail()`, `abortIssue()`, `updateIssueModelSelection()`, `steerIssue()`, and template override methods. The harness pseudo-code says `buildMinimalOrchestrator(db)` but this is hand-waved.

Building a "minimal orchestrator" that satisfies `OrchestratorPort` and is backed by a real SQLite DB is essentially building a partial Orchestrator -- this is significant work that the plan treats as a one-liner. The existing `server.test.ts` uses `{} as unknown as Orchestrator` with only the methods needed per test -- but integration tests need more methods to actually work. The plan should specify:
- Which `OrchestratorPort` methods are stubbed vs. real
- How the real DB is wired into the mock (is it via `SqliteAttemptStore`? `SqliteWebhookInbox`? Both?)
- What happens when a contract test calls an endpoint whose orchestrator method is a stub

### C7. SSE Reconnect Test Assumes `server.start(port)` With Same Port (Severity: MEDIUM)

The plan says for R11: "Use `server.stop()` then `server.start(port)` on the same `HttpServer` instance." But looking at the `HttpServer.start()` method (line 79-112 of `server.ts`):

```typescript
async start(port: number): Promise<{ port: number }> {
    if (this.server) {
      throw new Error("http server already started");
    }
```

After `stop()`, `this.server` is set to null, so `start()` can be called again. However, the test needs the same port for the browser's EventSource to reconnect. The plan says `server.start(port)` but on the first start it used `server.start(0)` for dynamic allocation. The test must:
1. Call `server.start(0)`, capture the assigned port
2. Call `server.stop()`
3. Call `server.start(capturedPort)` -- which may fail if the OS hasn't released the port yet (TIME_WAIT)

This is a real flake risk on CI. The plan should address this (e.g., short retry loop on EADDRINUSE, or SO_REUSEADDR configuration).

### C8. No `nightly.yml` Workflow Exists (Severity: MEDIUM)

The plan says "Create or modify: `.github/workflows/nightly.yml`" but the current CI uses `ci.yml` with a `schedule` trigger (`cron: "0 6 * * 1"` -- weekly on Monday). The plan should decide: modify the existing `ci.yml` schedule to add nightly jobs, or create a new `nightly.yml`. The current weekly schedule is not nightly -- this is a naming/intent mismatch that needs resolution.

Also, the current `ci.yml` already has an integration test job that runs on `main` only (lines 302-325), and mutation testing runs on schedule/dispatch (lines 327-369). The plan should explicitly state how the new test layers integrate with the existing CI job structure rather than just "create or modify."

### C9. Fullstack E2E Global Setup Has No Frontend Build Step (Severity: MEDIUM)

The plan says the fullstack project "uses real Risoluto backend serving built frontend" and the global setup "builds frontend, starts real HttpServer." But `HttpServer` serves whatever is at `frontendDir` as static files -- it doesn't build the frontend. The plan needs to specify:
- Is `pnpm run build` (which compiles the backend AND frontend) run in global setup, or is it assumed pre-built?
- If pre-built, what ensures the frontend artifacts exist in CI?
- The `webServer` config in the existing projects runs `vite` dev server -- the fullstack project needs a fundamentally different approach

### C10. Stryker Mutate Count Claims 42, Actually 42 (Severity: NONE -- VERIFIED)

I counted the `mutate` array in `stryker.config.json`: 42 entries. This matches the plan. The plan claims expansion to ~65, adding ~23 files. This is plausible.

### C11. Visual Baseline Count Claims 7, Actually 7 (Severity: NONE -- VERIFIED)

I found 7 `.png` files in the visual test snapshots directory. This matches the plan's claim of "7 baselines."

### C12. Visual Spec Count Claims 4, Actually 4 (Severity: NONE -- VERIFIED)

4 visual spec files exist: `overview.visual.spec.ts`, `queue.visual.spec.ts`, `settings.visual.spec.ts`, `setup.visual.spec.ts`. Matches the plan.

### C13. Integration Test Naming Inconsistency (Severity: LOW)

The vitest integration config matches `tests/**/*.integration.test.ts` and `tests/integration/**/*.test.ts`. But the plan creates:
- `tests/integration/sqlite-runtime.integration.test.ts` (matches first pattern)
- `tests/http/openapi-contracts.integration.test.ts` (matches first pattern)
- `tests/http/sse-contracts.integration.test.ts` (matches first pattern)
- `tests/orchestrator/restart-recovery.integration.test.ts` (matches first pattern)
- `tests/integration/linear-live.integration.test.ts` (matches first pattern)

All match via the first glob pattern, so this works. But the `test:integration:contracts` script in Unit 14 hardcodes paths to specific files rather than using the integration config include pattern. If files are renamed or moved, the scripts break silently.

### C14. Missing Requirement Coverage: R28 Script `test:integration` Not Defined (Severity: MEDIUM)

R28 requires a `test:integration` script. R29 says "PR gate adds: `test:integration`." Unit 14 defines `test:integration:sqlite`, `test:integration:contracts`, `test:integration:live`, `test:e2e:fullstack`, and `test:all` -- but never defines the umbrella `test:integration` script that R28 and R29 reference. The existing `package.json` likely already has `test:integration` (it's referenced in CI). The plan should clarify what this script runs: all of `sqlite + contracts + sse + recovery` or something else.

### C15. Requirements Trace Gap: Setup/Template/Audit API Contract Tests (Severity: MEDIUM)

R5 says "AJV response contract tests for all 27 API endpoints." As noted in C2, there are far more than 27 endpoints. But more importantly, the requirements doc and plan never explicitly scope or exclude the setup wizard endpoints (18 routes), template CRUD endpoints (3 routes), or audit endpoint. These are part of the production API surface. If intentionally excluded, R5 should say "all core API endpoints" not "all 27 API endpoints."

### C16. `HttpServer` Constructor Requires `webhookHandlerDeps` for Webhook Routes (Severity: LOW)

The harness pseudo-code lists `webhookSecret` as an override but doesn't address that `WebhookHandlerDeps` is a complex interface requiring `getWebhookSecret`, `requestRefresh`, `requestTargetedRefresh`, `stopWorkerForIssue`, `recordVerifiedDelivery`, `webhookInbox`, and `logger`. For Units 7 and 9 (which test webhooks), the harness must construct this full deps object. The plan should enumerate which parts are real vs. stubbed.

### C17. No Rollback Strategy for Schema Tightening (Severity: LOW)

The risk table says "Revert schema changes, keep `type: object`" for the schema tightening risk. But if Unit 2 is landed and Units 5-9 depend on it, reverting Unit 2 breaks Units 5-9. The rollback is only safe if Units 1-2 land in isolation before the dependent units. The plan doesn't specify commit/PR boundaries -- is this one giant PR or multiple?

### C18. `openDatabase()` Does Not Run Migrations (Severity: LOW)

The plan says integration tests will exercise "incremental migration" and "already-migrated DB" scenarios. But `openDatabase()` runs `CREATE TABLE IF NOT EXISTS` SQL (idempotent schema creation), not a migration system. The `migrator.ts` file exists but `openDatabase()` doesn't call it -- it seeds `schema_version` directly. The plan's test scenarios for "incremental migration -> existing data preserved, new columns added" may not match the actual code behavior. Need to verify whether `migrator.ts` is invoked anywhere in the boot path.

## Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | 6/10 | Endpoint count wrong, file paths wrong, webhook signing algorithm wrong. Someone unfamiliar would hit blockers. |
| Sequencing & Dependencies | 8/10 | Dependency graph is sound. Schema-first, harness-first is the right order. Minor gap: no PR/commit boundary specified. |
| Risk Coverage | 6/10 | Port reuse flake risk unaddressed. Harness construction complexity underestimated. CI integration plan vague. |
| Feasibility | 7/10 | Achievable but underestimated. Harness construction is bigger than a single unit. Setup/template/audit endpoints expand scope. |
| Edge Cases | 7/10 | Good coverage of dedup, replay, reconnect scenarios. Misses port reuse flake, partial harness initialization, concurrent DB cleanup races. |
| UX & Design Quality | N/A | Non-UI plan |
| Accessibility & Responsiveness | N/A | Non-UI plan |
| Clarity | 7/10 | Well-structured with clear patterns-to-follow sections. Undermined by factual errors that would mislead an implementer. |
| Scope Discipline | 6/10 | The 50+ endpoint surface is significantly larger than acknowledged. Either scope down explicitly or expand -- don't claim 27. |
| ROI / Effort | 8/10 | High value work. Integration tests for webhook-to-SSE flow are genuinely the highest-risk untested seam. |
| Goal Alignment | 8/10 | Every unit traces to a requirement. The testing expansion is the right work for pre-v1 hardening. |

**Overall: 7/10** -- The plan has the right structure and priorities, but contains factual errors (webhook signing, endpoint count, file paths) that would cause implementation failures. The shared harness unit underestimates the complexity of constructing a valid `OrchestratorPort` + `WebhookHandlerDeps`. These are fixable -- none are architectural -- but they need to be fixed before execution.

## Verdict

**CONDITIONAL GO -- 82%**

Conditions:
1. **Fix webhook signing algorithm** in the resolved questions section (C1)
2. **Fix or scope the endpoint count** -- either expand Unit 5 to cover all endpoints, or explicitly scope to core API with justification (C2)
3. **Fix wrong file paths** in Unit 12: `github-pr-client.ts` -> `issues-client.ts`, remove `setup/validate.ts` (C3, C4)
4. **Expand harness unit** to specify OrchestratorPort method stubs and WebhookHandlerDeps construction (C6)
5. **Address port reuse flake** in SSE reconnect test design (C7)
6. **Define the `test:integration` umbrella script** (C14)

Recommended but not blocking:
- Specify PR/commit boundaries for the implementation
- Clarify CI integration with existing `ci.yml` structure vs. new `nightly.yml`
- Verify migration test scenarios against actual `openDatabase()` behavior
