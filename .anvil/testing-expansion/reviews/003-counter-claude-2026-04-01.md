---
plan: "feat: Testing expansion -- integration, full-stack E2E, visual, mutation"
round: 3
mode: counter-review
model: claude-opus-4-6
date: 2026-04-01
previous: reviews/002-counter-codex-2026-04-01.md
verdict: CONDITIONAL GO
confidence: 88%
overall_score: 7/10
---

## What Works

The plan's structure and sequencing remain sound through two rounds of review. The dependency graph (schema tightening before contracts, harness before downstream integration work, mutation ratchet after coverage exists) is correct. The debates have surfaced real issues -- eight items are now settled with concrete fixes, and the remaining contested items are narrowing toward actionable amendments rather than architectural objections.

## Settled Points (8 items -- not re-evaluated)

Per ledger: C2, C4, C5, C7, C8, C13, C15, C18 are settled. All corrections are valid and should be applied during finalization.

## Contested Points

### C1: Webhook Signing -- `JSON.stringify(payload)` Validity
**Verdict**: AGREE with Codex (PARTIALLY AGREE with Claude R1)
**Their claim**: `JSON.stringify(payload)` is not inherently wrong if the exact serialized string is also used as the request body; the plan wording just needs tightening.
**My assessment**: I verified the actual codebase. The `verifyLinearSignature()` function at line 49 of `src/http/webhook-handler.ts` operates on `rawBody: Buffer`, which is captured by the `express.json({ verify })` callback at line 67-70 of `src/http/server.ts`. The existing test at `tests/http/webhook-handler.test.ts` lines 114-116 does exactly what Codex describes:

```
const bodyStr = JSON.stringify(payload);
const rawBody = Buffer.from(bodyStr);
const req = makeRequest(payload, { "linear-signature": sign(bodyStr) }, rawBody);
```

This works because the test controls both sides: the signature is computed over the same string that becomes the rawBody. Claude R1 was right that `JSON.stringify` is not byte-identical to what Express would produce from a real HTTP request body, but in a test context where you control both the signing and the request construction, this is perfectly valid. The plan should say: "serialize the payload to a string, sign that string, and use the same bytes as the request rawBody" -- matching what the existing tests already do.
**Recommended fix**: Update the resolved question to say "sign the exact serialized request body bytes" instead of implying `JSON.stringify(payload)` alone is sufficient. The existing test pattern is the correct reference.
**Status**: -> Settled

### C3: GitHub PR Client File Path
**Verdict**: AGREE with Codex
**Their claim**: Claude's replacement path was also wrong; the real file is `src/git/github-pr-client.ts`, not `src/github/issues-client.ts`.
**My assessment**: Verified via filesystem. Two distinct files exist:
- `src/git/github-pr-client.ts` -- this is the PR client the plan references
- `src/github/issues-client.ts` -- this is a different client for Linear-style issue operations

The plan says `src/github/github-pr-client.ts` (wrong). Claude R1 said replace with `src/github/issues-client.ts` (also wrong -- different client). Codex correctly identified `src/git/github-pr-client.ts` as the real file. The plan's mutation target should be `src/git/github-pr-client.ts`.
**Recommended fix**: Replace `src/github/github-pr-client.ts` with `src/git/github-pr-client.ts` in Unit 12.
**Status**: -> Settled

### C6: Shared Harness Complexity (merged with C16)
**Verdict**: PARTIALLY AGREE with Codex
**Their claim**: A two-tier harness design (thin default stubs plus opt-in webhook/event-bus wiring) is the right framing, not "build a partial real Orchestrator."
**My assessment**: I checked `OrchestratorPort` at `src/orchestrator/port.ts`. It has 14 methods. Most are simple getters (getSnapshot, getIssueDetail, getAttemptDetail, getTemplateOverride) that can return trivial stub values. The existing `server.test.ts` already proves `{} as unknown as Orchestrator` works for routes that don't call the missing methods.

However, `WebhookHandlerDeps` (lines 13-39 of `webhook-handler.ts`) is the real complexity for Units 7 and 9. It needs `getWebhookSecret`, `requestRefresh`, `requestTargetedRefresh`, `stopWorkerForIssue`, `recordVerifiedDelivery`, an optional `webhookInbox` with `insertVerified()`, and a `logger`. The existing `makeDeps()` in the test file shows this is ~10 lines of vi.fn() stubs, not architectural work.

Codex's two-tier framing is directionally right: a base harness with no-op stubs for OrchestratorPort plus opt-in layers for webhook deps, event bus, and real SQLite. But the plan still needs to specify which methods are stubbed vs. real per tier, even if briefly. Without this, the implementer will discover the contract during coding, which is acceptable but slower than necessary.
**Recommended fix**: Add a brief "harness tiers" section to Unit 3: Tier 1 (default) = all OrchestratorPort methods return empty/null stubs, no webhook deps, no event bus. Tier 2 (webhook) = adds WebhookHandlerDeps with real or mock inbox. Tier 3 (event bus) = adds TypedEventBus for SSE tests. The exact stub implementations are left to the implementer.
**Status**: -> Settled (with recommended amendment)

### C9: Fullstack Build/Setup Details
**Verdict**: AGREE with Codex
**Their claim**: The plan does mention a frontend build step, but the real gap is (a) the exact command/caching strategy and (b) the top-level `webServer` interaction in `playwright.config.ts`.
**My assessment**: I verified `playwright.config.ts`. The top-level `webServer` at lines 40-47 unconditionally starts a Vite dev server on port 5173. Playwright's architecture means this `webServer` runs for ALL projects unless the config is restructured. Adding a `fullstack` project with "no webServer" does NOT disable the top-level Vite server -- it just means the fullstack project doesn't add its own.

This is the real issue. The plan says "No `webServer` -- uses global setup instead" but the top-level `webServer` will still launch Vite even when running `--project=fullstack`. This creates two problems:
1. Vite dev server starts unnecessarily for fullstack runs
2. Port 5173 is occupied by Vite, potentially conflicting if the real backend also tries to serve on a fixed port

The fix is one of: (a) make `webServer` conditional on the project being run (Playwright doesn't natively support this), (b) split into two config files (`playwright.config.ts` for smoke/visual, `playwright.fullstack.config.ts` for fullstack), or (c) use `reuseExistingServer: true` and accept Vite running but unused. Option (b) is cleanest.

The build step IS mentioned in the plan ("Global setup builds frontend, starts real HttpServer"), but it needs to specify: is this `pnpm run build:frontend` (Vite production build) or `pnpm run build` (full TypeScript + frontend build)?
**Recommended fix**: Specify a separate `playwright.fullstack.config.ts` without the Vite `webServer`. Specify `pnpm run build` in global setup (backend types needed too, not just frontend).
**Status**: -> Settled (with recommended amendment)

### C14: `test:integration` Umbrella Script
**Verdict**: AGREE with Codex
**Their claim**: `test:integration` already exists in `package.json`; the real issue is how new subset scripts roll up into it.
**My assessment**: Verified at line 27 of `package.json`: `"test:integration": "vitest run --config vitest.integration.config.ts"`. This script exists. Claude R1 said it was "not defined" which is factually wrong.

The real question is what Codex identified: the plan adds new scripts (`test:integration:sqlite`, `test:integration:contracts`, `test:integration:live`) but never says whether the existing `test:integration` umbrella includes or excludes them. Since `vitest.integration.config.ts` matches `tests/**/*.integration.test.ts` and `tests/integration/**/*.test.ts`, any new files following those patterns will automatically be included. The live tests (which require credentials) should probably be excluded from the default `test:integration` lane and only run via `test:integration:live`.
**Recommended fix**: Clarify that `test:integration` runs all non-credential-gated integration tests via the existing vitest config. `test:integration:live` is a separate credential-gated lane. The plan should note that live test files should use a naming pattern or config that excludes them from the default integration run (e.g., `tests/integration/live/*.test.ts` excluded from `vitest.integration.config.ts`).
**Status**: -> Settled

### C17: PR/Commit Boundary Specification
**Verdict**: PARTIALLY AGREE with Codex
**Their claim**: Landing boundaries would improve the plan but are not a blocker.
**My assessment**: Codex is right that this is not a blocker for the plan's correctness -- an implementer can sequence PRs on their own. However, the dependency matters more than Codex acknowledges: Unit 2 changes production code (response schemas in `openapi-paths.ts` and `response-schemas.ts`), and Units 5-9 depend on those schemas existing. If Unit 2 is reverted, Units 5-9 break. This is a real risk if everything lands in one PR and a partial revert is needed.

That said, specifying exact PR boundaries in a plan is unusual and somewhat over-prescriptive. A lighter touch: note that Unit 2 should land and be stable before Units 5+ build on it, and recommend at minimum a two-PR split (Units 1-4 as foundation, Units 5-14 as dependent work).
**Recommended fix**: Add a "Landing Strategy" note: "Unit 2 (schema tightening) changes production code and should be landed and verified before Units 5+ build on it. Recommend minimum two PRs: foundation (Units 1-4) and dependent work (Units 5-14)."
**Status**: -> Settled (advisory, not blocking)

## Open Points

### N1: Playwright Global `webServer` Affects All Projects
**Verdict**: AGREE -- valid issue
**My assessment**: Verified. The top-level `webServer` in `playwright.config.ts` (lines 40-47) is unconditional. Playwright starts the `webServer` before any project runs, regardless of which project is selected. Adding `fullstack` with no per-project `webServer` does not suppress the top-level one.

This means `pnpm exec playwright test --project=fullstack` will:
1. Start Vite dev server on port 5173 (from the top-level `webServer`)
2. Then run fullstack tests that don't need Vite at all

This wastes resources and could cause port conflicts. The cleanest fix is a separate `playwright.fullstack.config.ts` that omits `webServer` entirely and uses global setup for the real backend.
**Recommended fix**: Plan should specify `playwright.fullstack.config.ts` as a separate config. The fullstack test command becomes `playwright test --config playwright.fullstack.config.ts`.
**Status**: -> Settled

### N2: AJV Not in Dependencies
**Verdict**: AGREE -- valid issue
**My assessment**: Confirmed by searching `package.json`. No `ajv` in dependencies or devDependencies. Unit 5 introduces AJV for contract validation but the plan never mentions adding it as a dependency.
**Recommended fix**: Unit 5 prerequisites should include `pnpm add -D ajv` (devDependency, since it's only used in tests).
**Status**: -> Settled

### N3: Fullstack Fixture Lifecycle Control
**Verdict**: AGREE -- valid issue
**My assessment**: Unit 9's SSE reconnect test says "stop server (`server.stop()`), restart server (`server.start(port)`)". But Unit 8 says the global setup manages the server lifecycle and the fixture only provides `baseUrl` and `webhookSecret`. There is no mechanism for individual spec files to stop and restart the server.

This is a real gap. Either: (a) the fullstack fixture exposes `server.stop()` and `server.start()` handles for the reconnect test (breaking isolation -- other tests would fail during the restart window), or (b) the SSE reconnect test gets its own isolated server instance outside the global setup, or (c) the SSE reconnect test moves to the Vitest integration suite (Unit 6) where it has direct server control, and the Playwright fullstack suite only tests browser-side reconnect behavior with a more controlled approach.

Option (c) is cleanest: Unit 6 already covers SSE reconnect at the protocol level. The fullstack reconnect spec should focus on verifying the browser's EventSource reconnects and receives events after a brief outage, which could be simulated by temporarily blocking the SSE endpoint (e.g., via a middleware flag) rather than actually stopping the server.
**Recommended fix**: Move the server stop/restart reconnect test to Unit 6 (Vitest integration, direct server control). The fullstack `sse-reconnect.fullstack.spec.ts` should test browser-side reconnect behavior using a middleware-level simulation (e.g., temporarily returning 503 on `/api/v1/events` then re-enabling it).
**Status**: -> Settled (with recommended amendment)

### N4: Unit 1 Sync Test Ossifying Incomplete OpenAPI Surface
**Verdict**: PARTIALLY AGREE
**My assessment**: This is a valid observation but lower severity than Codex implies. The sync test's purpose is to prevent silent drift between the runtime-generated spec and the checked-in spec. If both are incomplete (missing setup/template/audit endpoints), the sync test correctly enforces consistency between them. When the spec is later expanded, the sync test will enforce the expanded spec.

The risk Codex identifies -- that the test "preserves the omission" -- is only a problem if the team forgets to expand the spec. But that's a scope decision, not a testing deficiency. The plan already acknowledges the spec is incomplete (C2/C15 settled that the denominator is wrong).

That said, the plan should note that Unit 1 validates spec-to-runtime consistency, NOT spec completeness. Spec completeness is a separate concern.
**Recommended fix**: Add a note to Unit 1: "This test validates consistency between the runtime-generated spec and the checked-in spec. It does not validate spec completeness -- runtime routes not in the OpenAPI spec are not covered by this test."
**Status**: -> Settled (advisory)

## Additional Issues Found

### A1: `@stryker-mutator/core` Version Compatibility (Severity: LOW)
The plan expands the Stryker mutate array from 42 to ~65 files and sets progressive thresholds. Current Stryker config uses `concurrency: 4` and `timeoutMS: 60000`. With 65 files, the total mutation run time could grow significantly. The plan should note whether the existing timeout and concurrency settings are adequate for the expanded target set, or whether `timeoutMS` needs increasing for the full nightly run.

### A2: Live Test Isolation from Default Integration Lane (Severity: MEDIUM)
The plan creates `tests/integration/linear-live.integration.test.ts` which matches the `tests/**/*.integration.test.ts` glob in `vitest.integration.config.ts`. This means `pnpm run test:integration` will attempt to run live tests even when no credentials are present. The `describe.skipIf(!process.env.LINEAR_API_KEY)` guard prevents failures, but the test file still gets loaded and the skip message clutters CI output. More importantly, if a live test has a top-level import that fails without credentials (e.g., importing a module that eagerly validates env vars), the skip guard won't save it.

The plan should either: (a) use a separate glob pattern for live tests that's excluded from the default integration config, or (b) use a separate vitest config (`vitest.live.config.ts`) for the live lane.

## Revised Scores

| Dimension | Score | Delta | Notes |
|-----------|-------|-------|-------|
| Completeness | 6/10 | +1 | Most factual errors are now identified and have fixes. AJV dependency and Playwright config split still need adding. |
| Sequencing & Dependencies | 8/10 | +1 | Sound. N3 (fixture lifecycle) is the last sequencing gap, now resolved. |
| Risk Coverage | 6/10 | +1 | Port reuse flake addressed (C7 settled). Playwright config interaction identified (N1 settled). Live test isolation is new (A2). |
| Feasibility | 7/10 | 0 | Achievable. Harness tiers clarified. Build/config details still need specifying. |
| Edge Cases | 7/10 | +1 | SSE reconnect moved to correct test layer. Live test isolation identified. |
| UX & Design Quality | N/A | - | Non-UI plan |
| Accessibility & Responsiveness | N/A | - | Non-UI plan |
| Clarity | 7/10 | 0 | Well-structured. Amendments from 3 rounds of review will improve precision. |
| Scope Discipline | 6/10 | +1 | API scope question resolved to "validate OpenAPI-covered surface, note incompleteness." |
| ROI / Effort | 8/10 | 0 | High-value work targeting the right seams. |
| Goal Alignment | 8/10 | 0 | Every unit traces to requirements. |

**Overall: 7/10** -- The plan is structurally sound. Three rounds of review have identified and resolved the factual errors, architectural gaps, and sequencing issues. The remaining amendments are concrete and enumerable -- this is ready for finalization with the listed conditions.

## Verdict

**CONDITIONAL GO -- 88%**

All contested points are now settled. Conditions for finalization:

1. **Apply all 8 settled corrections from rounds 1-2** (C2, C4, C5, C7, C8, C13, C15, C18)
2. **Apply 6 newly settled corrections from round 3** (C1, C3, C6, C9, C14, C17)
3. **Apply 4 open point resolutions** (N1: separate Playwright config, N2: add AJV dep, N3: move server restart to Unit 6, N4: add completeness note to Unit 1)
4. **Address A2**: Exclude live tests from the default `test:integration` lane

None of these require architectural changes -- they are all concrete amendments to the existing plan text.

## Debate Ledger

**Plan**: feat: Testing expansion -- integration, full-stack E2E, visual, mutation
**Round**: 3

### Settled (all models agree)
- [C1] Webhook signing: `JSON.stringify(payload)` is valid when the same bytes are used as rawBody; plan wording should say "sign the exact serialized request body bytes" -- settled round 3
- [C2] API denominator is wrong: OpenAPI spec has 20 paths / 23 operations; runtime has 55 method/path combinations; "27 API endpoints" is inaccurate -- settled round 2
- [C3] Plan path `src/github/github-pr-client.ts` is wrong; real file is `src/git/github-pr-client.ts`; Claude R1's replacement `src/github/issues-client.ts` is a different client -- settled round 3
- [C4] `src/setup/validate.ts` does not exist -- settled round 2
- [C5] Event bus has 13 channels, not 12 -- settled round 2
- [C6] Shared harness needs two-tier design (default stubs + opt-in webhook/event-bus layers) rather than partial real orchestrator; plan should briefly enumerate tiers -- settled round 3
- [C7] SSE reconnect on same port has real `EADDRINUSE` flake risk because `HttpServer.start()` hard-fails on port reuse -- settled round 2
- [C8] No `nightly.yml` exists; repo uses `.github/workflows/ci.yml` with weekly schedule trigger -- settled round 2
- [C9] Fullstack build step is mentioned but underspecified; real gap is exact command, caching, and need for separate `playwright.fullstack.config.ts` to avoid top-level `webServer` conflict -- settled round 3
- [C13] Hardcoded integration test script paths are fragile to renames -- settled round 2
- [C14] `test:integration` already exists in `package.json`; plan needs to clarify how new subset scripts roll up and how live tests are excluded from the default lane -- settled round 3
- [C15] Contract-test scope does not cover setup/template/audit and other runtime routes omitted from the current OpenAPI spec -- settled round 2
- [C17] PR/commit boundaries: recommend minimum two-PR split (Units 1-4 foundation, Units 5-14 dependent work); advisory, not blocking -- settled round 3
- [C18] `openDatabase()` is schema bootstrap, not a SQL migration system; migration testing should target bootstrap/idempotence -- settled round 2
- [N1] Playwright fullstack project requires separate config file (`playwright.fullstack.config.ts`) because top-level `webServer` in `playwright.config.ts` is unconditional -- settled round 3
- [N2] Unit 5 introduces AJV but `package.json` does not include `ajv`; must add as devDependency -- settled round 3
- [N3] Unit 9 SSE reconnect test needs server lifecycle control not provided by the fullstack fixture; move server stop/restart testing to Unit 6 (Vitest), fullstack spec should use middleware-level simulation -- settled round 3
- [N4] Unit 1 sync test validates spec consistency, not completeness; plan should add a note clarifying this distinction -- settled round 3

### Contested (models disagree)
*(none remaining)*

### Open (raised, not yet addressed by all)
- [A2] Live test files (`tests/integration/*-live.integration.test.ts`) match the default `vitest.integration.config.ts` glob and will be loaded during `pnpm run test:integration` even without credentials; should be excluded from the default integration lane -- raised by claude-opus-4-6 round 3

### Score History
| Round | Version | Model | Overall | UX & Design | A11y & Responsive | Verdict |
|-------|---------|-------|---------|-------------|-------------------|---------|
| 1 | v1 | claude-opus-4-6 | 7/10 | N/A | N/A | CONDITIONAL GO 82% |
| 2 | v1 | codex-gpt5.4 | 6/10 | N/A | N/A | CONDITIONAL GO 84% |
| 3 | v1 | claude-opus-4-6 | 7/10 | N/A | N/A | CONDITIONAL GO 88% |
