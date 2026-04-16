# Cleanup Punchlist — 2026-04-16

Aggregate of findings from 11 code-cleanup agents run in parallel, discovery-only mode, across the whole repo.

**Scope:** `src/` + `frontend/src/` + `tests/` + `scripts/` + `skills/`. Excluded `dist/`, `node_modules/`, `coverage/`, `.risoluto/`.

**Agents:** dead-code-hunter, slop-remover, weak-type-eliminator, defensive-code-cleaner, dry-deduplicator, type-consolidator, async-pattern-fixer, circular-dep-untangler, legacy-code-remover, security-scanner, performance-optimizer.

**Uncommitted at time of scan:** `frontend/src/components/issue-inspector-common.ts`, `issue-inspector-sections.ts`, `issue-inspector.ts`, `frontend/src/styles/issue.css`. Findings in these files are flagged **[UNCOMMITTED]**.

---

## TIER 1 — Real bugs / correctness risk

### Security

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| S1 | `src/http/write-guard.ts:80` | `suppliedToken !== writeToken` — timing attack on write-token equality | `timingSafeEqual(Buffer.from(suppliedToken), Buffer.from(writeToken))`. Pattern already used correctly in `src/http/trigger-handler.ts:79` and `src/webhook/signature.ts` |
| S2 | `src/http/read-guard.ts:106, 124` | `configuredHeaderTokens.includes(bearerToken)` / `configuredQueryTokens.includes(queryToken)` — same timing oracle | Extract `isValidToken(supplied, candidates)` using `timingSafeEqual` via `candidates.some(...)` |
| S3 | `src/git/manager.ts:43-44` | Tracker-supplied `issue.branchName` passed verbatim to `git worktree add` after only `.trim()`. Branch name starting with `-` (e.g. `--force`) becomes a flag. Not shell injection (array spawn), but semantic flag injection | Reject leading `-`, prefix with `./`, or run through `sanitizeBranchSegment` |
| S4 | `src/dispatch/factory.ts:38-39` | `DISPATCH_SHARED_SECRET` defaults to `""` when `DISPATCH_MODE=remote`. Data-plane entrypoint guards itself, but the control-plane `DispatchClient` silently sends `Authorization: Bearer ` with empty secret | Mirror entrypoint guard in `createDispatcher`: throw if `dispatchMode === "remote" && !process.env.DISPATCH_SHARED_SECRET` |

### Async — floating promises with no error handler (HIGH)

| # | File:Line | Issue |
|---|-----------|-------|
| A1 | `src/alerts/engine.ts:27` | `void this.pipeline.processEvent(...)` in hot path. Alert rules silently die on any throw. Fix: add `.catch(logger.error)` |
| A2 | `src/orchestrator/retry-coordinator.ts:144` | `void this.handleRetryLaunchFailure(...)` inside `setTimeout` callback. No surrounding try/catch. Partial state mutation on throw (mutates `runningEntries`, logs, bus events) |
| A3 | `src/orchestrator/run-lifecycle-coordinator.ts:272` | `void this.deps.notificationManager.notify(event)` swallows Slack/desktop/webhook channel errors |
| A4 | `src/automation/scheduler.ts:118` | Same `notify` pattern — fires during an already-failing automation, so silencing hides the root problem |
| A5 | **[UNCOMMITTED]** `frontend/src/components/issue-inspector-sections.ts:103, 146` | `api.getModels().then(...)` and `api.getTemplates().then(...)` with no `.catch`. Dropdowns silently stay at placeholder on 4xx/5xx. User can't tell failed-to-load from empty |

### Type / data correctness

| # | File:Line | Issue |
|---|-----------|-------|
| T1 | `src/persistence/sqlite/attempt-store-sqlite.ts:265` | `row.attemptId ?? ""` coerces nullable DB column into empty-string `attemptId`. Downstream `getAttempt("")` returns null silently. Decide: is `PrRecord.attemptId` actually nullable (external PRs)? Update type + callers, or throw a `TypeError` at the boundary |
| T2 | `src/tracker/github-adapter.ts:106-111` + `src/tracker/linear-adapter.ts:85` | `catch {}` on `transitionIssue` silently returns `{ success: false }`. Callers can't distinguish network errors, auth failures, and legitimate permission denials. At minimum bind `error` and log at `warn` |
| T3 | `src/webhook/types.ts` vs `src/persistence/sqlite/webhook-inbox.ts` | `WebhookInboxStats` field drift — `types.ts` is missing `duplicateCount` + `lastDeliveryAgeSeconds`, carries phantom `lastAppliedAt` not in the impl. Remove from `types.ts`, import from persistence (matching what `webhook/port.ts` already does) |
| T4 | `src/core/types/runtime.ts` vs `frontend/src/types/runtime.ts` | `RuntimeSnapshot.queued`/`completed` are **optional** in backend but **required** in frontend. Frontend has `?? []` fallbacks in `sidebar-badges.ts`, `overview-descriptions.ts` that are technically unreachable per the frontend type but actually compensate for real backend optionality. Align (probably mark required on both sides if the server always sends them) |
| T5 | `tests/e2e/mocks/data/attempts.ts` + `issue-detail.ts` | Import `RecentEvent` from `src/core/types.ts` (camelCase), but the dashboard reads snake_case from the wire. E2E mocks may be serving camelCase where the component expects snake_case — latent test correctness issue |

### Performance (HIGH)

| # | File:Line | Issue |
|---|-----------|-------|
| P1 | `src/http/routes.ts:52` | `readFileSync(spaIndexPath, "utf8")` in the Express catch-all handler. Blocking disk read on every SPA navigation. Read once at startup, close over the string |
| P2 | `src/orchestrator/orchestrator.ts:214, 311, 393` | `[...this._state.runningEntries.values()].find(entry => entry.issue.identifier === ...)` in three handlers. Spread allocates new array + linear scan per call. Maintain secondary `runningByIdentifier: Map<string, string>` for O(1) lookup |

---

## TIER 2 — Cleanup with clear wins

### Deletions

| # | File | Action |
|---|------|--------|
| D1 | `src/agent-runner/codex-runtime-port.ts` | Orphaned re-export barrel. Knip-confirmed zero importers. All callers go direct to `./session-port.js` / `./docker-runtime.js`. Delete |
| D2 | `src/webhook/index.ts` | Same — orphaned barrel, consumers bypass it. Delete |
| D3 | `src/orchestrator/outcome-view-builder.ts:19-31` | `OutcomeViewInput` declared twice verbatim in the same file. TS silently merges. Delete second declaration. Also consider if the thin `buildOutcomeView` wrapper adds value |

### Refactors (single-file blast radius)

| # | File | Action |
|---|------|--------|
| R1 | `src/orchestrator/run-lifecycle-coordinator.ts` | 6 `finalize*` methods end with identical 3-step commit (`setCompletedView` → `emit("issue.completed", ...)` → `releaseIssueClaim`). Extract private `commitFinalizedView(issue, view, outcome)`. ~60 lines saved |
| R2 | `src/notification/slack-webhook.ts:137-169` + `src/notification/webhook-channel.ts:53-86` | Identical fetch-with-AbortController timeout logic, identical catch+rethrow, identical `response.ok` check, identical `finally clearTimeout`. Extract `postWebhook(url, body, options)` in `src/notification/http-deliver.ts` |

### Type fixes (3-for-1 opportunity)

| # | File:Line | Action |
|---|-----------|--------|
| TY1 | `src/git/github-api-tool.ts:26` + `src/git/manager.ts:243` | `getPrStatus(): Promise<unknown>` where `PrStatusResponse` already exists in the concrete impl. Declare the real type on both. Side effect: retires the `as unknown as PrMonitorGhClient` cast at `src/cli/services.ts:264` |
| TY2 | `src/agent-runner/session-helpers.ts:127` | `buildDynamicTools(): object[]` — replace with concrete tool-schema type if one exists, else `Record<string, unknown>[]` |
| TY3 | `frontend/src/views/codex-admin/codex-admin-helpers.ts:80` | `Promise<unknown \| null>` — per CLAUDE.md `unknown \| null` is just `unknown`. Function returns `null` or `{ answers: Array<{id, value}> }` — type it |
| TY4 | `src/setup/handlers/shared.ts:3` | `SetupApiDeps = SetupPortDeps` transparent alias. Delete; import `SetupApiDeps` directly from `../port.js` |

### Deferred-init weakening casts

| # | File:Line | Action |
|---|-----------|--------|
| TY5 | `src/agent-runner/docker-session.ts:160` | `null as unknown as JsonRpcConnection`. Change `DockerSession.connection` to `JsonRpcConnection \| null`, handle null at access sites |
| TY6 | `src/orchestrator/run-lifecycle-coordinator.ts:183` | `undefined as unknown as OrchestratorContext["retryCoordinator"]`. Restructure builder so `ctx` isn't assembled before `retryCoordinator` is ready, or make field optional in partial builder type |

### Frontend silent failures

| # | File:Line | Action |
|---|-----------|--------|
| F1 | `frontend/src/views/config-view.ts:193, 196, 258, 260, 268` | 5× `.catch(() => {})` swallows config save + initial load errors. User has no feedback when saves fail. Add `toast(toErrorString(error), "error")` and/or error state |
| F2 | `frontend/src/pages/queue-board.ts:40, 56` | `dragManager.moveByOffset(...).catch(() => {})` — drag-drop silently fails. Card stuck optimistically in wrong column |
| F3 | `frontend/src/pages/queue-view.ts:97` | `inspector.load(state.routeId).catch(() => {})` silent inspector-load failure |
| F4 | `src/codex/control-plane.ts:218` | `cp(srcAuth, ...).catch(() => {})` — auth file copy failure hidden. Codex starts without creds, fails with opaque error downstream. At minimum `logger.warn` |

---

## TIER 3 — Slop / modernization (lint-enforceable)

### Comment removals (~19 high-confidence)

**Repeat offenders:**
- `frontend/src/pages/overview-view.ts:133, 213, 278, 281, 284, 287` — labels that restate the single function call that follows
- `src/cli/services.ts:69-71, 93-95, 139-141, 177-179, 201-203, 276-278, 330-332` — 7 `// ----` divider sandwiches
- `src/webhook/registrar.ts` — 6 divider pairs for `Secret resolution pipeline`, `Strategy N`, `Error handling`
- `src/orchestrator/snapshot-builder.ts:323, 354, 480` — function preambles that restate names

**Specific restatements to delete:**
- `src/git/pr-monitor.ts:185, 200` (keep 233 — explains side effect)
- `src/git/pr-summary-generator.ts:130, 168`
- `src/persistence/sqlite/runtime.ts:77`
- `src/agent-runner/docker-session.ts:261` (keep 109-112 — WHY block)
- `frontend/src/components/system-health-badge.ts:31`
- `frontend/src/components/webhook-health-panel.ts:71`
- `frontend/src/views/setup-openai-controller.ts:95, 122, 165`

**PR-context leak:**
- `src/core/types.ts:2-4` — references dead Epic #410. Rewrite to keep architectural reasoning without issue number

**Padded JSDoc (strip `@param`/`@returns` bare lines, keep prose above):**
- `src/docker/spawn.ts:252-253`
- `src/persistence/sqlite/migrator.ts:54`
- `src/persistence/sqlite/database.ts:491-492` (keep `@param` `:memory:` hint, drop `@returns`)
- `src/git/merge-policy.ts:28-32`
- `src/git/github-pr-client.ts:249-253`

### Modernization

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| M1 | `src/git/pr-summary-generator.ts:156` | ```diff.replace(/```/g, "`` ")``` | `.replaceAll` |
| M2 | `tests/agent-runner/agent-runner.test.ts:25` | `value.replace(/'/g, ...)` | `.replaceAll` |
| M3 | `skills/anvil-verify/scripts/context.ts:70` | `.replace(/[\`]/g, "")` | `.replaceAll` |
| M4 | `frontend/src/components/modal.ts:92` | `focusableElements[focusableElements.length - 1]` | `.at(-1)` |
| M5 | `src/git/pr-review-ingester.ts:217-218` | Two consecutive `lines.push()` | Merge: `lines.push(heading, "", url, "")` |

**Recommendation:** add `unicorn/prefer-at` + `unicorn/prefer-string-replace-all` to the ESLint config rather than hand-fixing. Preempts future occurrences.

---

## TIER 4 — Defer / investigate

| # | File | Issue | Why defer |
|---|------|-------|-----------|
| DF1 | `src/secrets/store.ts:21` + `src/secrets/db-store.ts:24` | Single SHA-256 as KDF for `MASTER_KEY` — no salt, no stretching. AES-GCM itself correct | Breaking change (envelope version bump + migration). Plan alongside other secrets work |
| DF2 | `src/orchestrator/core/lifecycle-state.ts:257-258` | `splice(0, length - 250)` on `recentEvents` overflow is O(n), fires per turn-event on sustained load | Requires ring-buffer conversion; measure first |
| DF3 | `frontend/src/state/store.ts:31` | `JSON.stringify(target) !== JSON.stringify(source)` array eq on every SSE merge (touches `recentEvents` up to 250 entries) | Needs a fingerprint strategy (length + last timestamp) |
| DF4 | `src/persistence/sqlite/attempt-store-sqlite.ts:93, 104, 160` | `sumArchivedSeconds` / `sumCostUsd` / `sumArchivedTokens` — three full-table aggregates per snapshot build. Gated by dirty-tracking cache, so not every tick | Fold into one query, or maintain running totals on attempt transition |
| DF5 | `src/orchestrator/snapshot-builder.ts:402-463` | `findLatestEvent` called 4× per attempt detail, each allocates `[...events].reverse()` | Replace with single reverse-scan collecting all 4 targets |
| DF6 | `src/orchestrator/recovery.ts:178-180` | Serial `await cleanupContainer(...)` loop | `Promise.all(...)` — startup-only, low priority |
| DF7 | `frontend/src/pages/queue-board.ts:186` | Full `recentEvents` array passed to every kanban card on render | Pre-filter per-issue or pass only fingerprint |

**Low-confidence dead exports** (verify then delete):

| # | File:Line | Symbol |
|---|-----------|--------|
| DE1 | `src/orchestrator/core/lifecycle-state.ts:40` | `LifecycleCommand` — exported, zero importers |
| DE2 | `tests/setup/setup-fixtures.ts:76` | `createTrackerMock()` — zero call sites |
| DE3 | `src/orchestrator/views.ts:45` | `usageDelta()` — only used by its own test file; test covers dead production logic |

**File-local exports to downgrade to private:**
- `src/orchestrator/core/snapshot-projection.ts:6, 16` — `ModelViewFields` interface + `projectModelViewFields()` only used within same file
- `src/orchestrator/recovery-types.ts:3, 5` — `RecoveryAction`, `RecoveryAssessment` only consumed by `recovery.ts`

**Documentation gap:**
- `frontend/src/types/observability.ts` — add WHY comment documenting the camelCase↔snake_case split (pattern used by `runtime.ts` and `config.ts`)
- `src/core/types/runtime.ts` — inline `webhookHealth` anonymous type should reference `WebhookHealthState` from `src/webhook/types.ts`

---

## Clean results (no action needed)

- **Circular deps**: 0 cycles across 511 modules. Port/adapter pattern is working
- **Polyfills / `@deprecated` annotations / `var` / `require()` in ESM**: all zero
- **`forEach(async ...)`**: zero occurrences
- **Hardcoded secrets**: zero in tracked code (`sk-` / `ghp_` hits are in sanitizer masking + setup hint strings)
- **Tracker adapter structural similarity** (Linear ↔ GitHub): correctly identified as port-pattern intentional
- **Backend↔frontend type mirrors** (PromptTemplate, AuditRecord, Notification*, Observability*, SystemHealth): correctly flagged as intentional API boundary given no shared package
- **`better-sqlite3` sync API throughout persistence**: explicit design choice, not a finding
- **All `// Older Codex versions...` compat comments**: correctly preserved
- **All `innerHTML` in `setup-openai-step.ts`**: static literals only, no XSS

---

## Recommended ordering

1. **Today / blocker** — if you're about to push the uncommitted `issue-inspector` work, fix A5 (floating promises on getModels/getTemplates) as part of that diff
2. **Security sweep** — S1-S4 as one PR (scope: `http`, `git`, `dispatch`). Small diffs, shared pattern (`timingSafeEqual`), no behavioral change outside of attack surface
3. **Async hardening** — A1-A4 as one PR (scope: `orchestrator`, `alerts`, `automation`). Add `.catch(logger)` or proper handler per site
4. **Type correctness** — T1-T5 as one PR (scope: `persistence`, `tracker`, `webhook`, `core`, `e2e`). Includes aligning RuntimeSnapshot types and fixing the test mock drift
5. **Performance quick wins** — P1 + P2 as one PR (scope: `http`, `orchestrator`). Both are self-contained, no new abstractions
6. **Cleanup batch** — Tier 2 deletions + extractions + type fixes as one or two PRs (scope: `orchestrator`, `notification`, `git`, `agent`, `setup`, `frontend`)
7. **Slop + lint** — Tier 3 in a single "chore" PR, primarily delete-only. Add the two unicorn lint rules at the end
8. **Tier 4** — park until a related feature forces the hand

## Attribution

Per-agent raw outputs archived in `/tmp/claude-1000/-home-oruc-Desktop-workspace-risoluto/f9150226-2f38-4710-9a2f-4fb45e9a52a7/tasks/` (ephemeral — move if you want them persisted).
