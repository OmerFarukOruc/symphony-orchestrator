# Learnings - refactor-oversized-modules

## Conventions

## Patterns Discovered

- `src/agent-runner.ts` routes `item/started` and `item/completed` notifications through the pure `extractItemContent(...)` helper, then emits sanitized `RecentEvent.content` values from that single seam.
- The extraction seam supports exact helper paths for `agentMessage`, `reasoning`, `commandExecution`, `fileChange`, `dynamicToolCall`, `webSearch`, and `userMessage`; only `reasoning` and `agentMessage` were previously exercised by the fixture-backed runner test.
- `reasoning` completion prefers buffered deltas from `reasoningBuffers` over `summary` or `text`, and the buffer is cleared only after the completed item event is emitted.
- `fileChange` completed content is sanitized with `isDiff: true`, so the exact truncation contract is 500 chars plus the `…[diff truncated, N more chars]` suffix.
- `dynamicToolCall` started content stringifies arguments directly without structural redaction, while completed content is sanitized after stringification so nested secret-like keys are redacted in exact JSON output.
- Failure characterization is slightly stricter than the high-level names imply: `turn_input_required` preserves `threadId` and `turnCount` but leaves `turnId` null because `turn/start` never returned successfully, and `port_exit` preserves the `port_exit` code while surfacing the specific connection-exit message.

## Decisions Made


## 2026-03-16 Task 2 Deferred Guardrails

- `src/http-server.ts` is a thin contract surface whose existing test already pins the dashboard shell and key API/405 behavior.
- `src/orchestrator.ts` detail payloads depend directly on `AttemptStore` archive semantics, so `src/attempt-store.ts` must stay deferred until dedicated characterization covers indexing, ordering, event replay, and legacy migration behavior.
- The inline browser script in `src/dashboard-template.ts` consumes exact payload names and shapes from `/api/v1/state`, `/api/v1/:issue_identifier`, and `/api/v1/attempts/:attempt_id`; structural dashboard refactors must wait for targeted characterization rather than relying on indirect HTTP coverage.
- Phase-one extraction can move the parsing/content seam into `src/agent-runner-helpers.ts` without touching request routing, turn completion resolver ordering, or subprocess lifecycle logic, as long as `src/agent-runner.ts` keeps the runtime call sites and re-exports `extractItemContent` for existing tests.

## 2026-03-16 Task 4 Adjacent Regression Gates

- `tests/http-server.test.ts` is the direct guard for stable public API shape after nearby refactors; it pins both route ordering/405 behavior and snake_case response fields such as `generated_at`, `current_attempt_id`, and `applies_next_attempt`.
- `src/http-server.ts:19-43` remains the critical serialization seam for `/api/v1/state`; adjacent extractions must not rename fields like `codex_totals`, `recent_events`, `issue_id`, or `session_id`.
- `tests/orchestrator.test.ts` still protects the adjacent runtime contracts that matter here: retry backoff after abnormal exits, active-worker cancellation during shutdown, and model selections applying to the next attempt instead of forcing an in-flight restart.
- Re-running `npm test -- tests/orchestrator.test.ts`, `npm test -- tests/http-server.test.ts`, and the full `npm test` suite after Task 3 stayed green, which is good evidence that the phase-one helper extraction stayed isolated to `agent-runner` behavior.

## 2026-03-16 Task 5 Next Orchestrator Seam

- The safest first post-phase-one seam in `src/orchestrator.ts` is runtime view shaping, not `launchWorker(...)`: the retry row/detail builders are duplicated between `getSnapshot()` (`src/orchestrator.ts:188-202`) and `getIssueDetail()` (`src/orchestrator.ts:218-232`), while queue/detail-cache shaping is duplicated between `refreshQueueViews()` (`src/orchestrator.ts:443-456` and `461-472`).
- `runningIssueView(...)` at `src/orchestrator.ts:841-864` already shows the extraction direction: keep orchestration state access in the class, but move pure `RuntimeIssueView` construction into helper functions parameterized by resolved model selection.
- `tests/orchestrator.test.ts:81-346` is still lifecycle-first coverage, so characterization for queued rows, retry row/detail parity, and running row metadata must land before any helper extraction; otherwise a refactor could silently drift API-visible fields without failing current tests.
- Even though `usageDelta(...)` is pure at `src/orchestrator.ts:96-101`, it should stay out of the first pass because token accounting mistakes would affect codex totals and running usage, which is a wider blast radius than the view-only seam.

## 2026-03-16 Task 6 Attempt Store Characterization

- `src/attempt-store.ts` currently persists only per-attempt JSON archives plus per-attempt `.jsonl` event streams; there is no standalone persisted issue index or `persistIssueIndex()` method in the current implementation, so issue lookup is rebuilt from archived attempt files during `start()`.
- `createAttempt()` immediately writes both archive files: `<baseDir>/attempts/<attemptId>.json` with pretty-printed JSON and `<baseDir>/events/<attemptId>.jsonl` as an empty file.
- Event storage is chronological on disk and in memory because `appendEvent()` uses `push()` plus `appendFile()`, but `getEvents()` intentionally returns a reversed copy, so API consumers observe reverse chronological order.
- Startup contains a legacy migration seam: if an existing event archive is detected as newest-first, `start()` reverses it in memory, returns newest-first through `getEvents()`, and asynchronously rewrites the `.jsonl` file into chronological order.
- Issue retrieval order comes from two layers: `indexAttempt()` uses `unshift()` so newly seen attempt ids lead the per-issue index, and `getAttemptsForIssue()` then sorts the resolved records descending by `startedAt`; duplicate attempt ids are ignored when re-indexing.
- `updateAttempt()` persists the patched archive and reindexes attempts when `issueIdentifier` changes, which means issue-based retrieval after restart depends entirely on the archived attempt JSON contents rather than any separate index file.

## 2026-03-16 Task 7 Dashboard Shell Characterization

- The root dashboard contract is best pinned from `tests/http-server.test.ts` because `src/http-server.ts:96-99` only streams `renderDashboardTemplate()` directly for `/`; shell regressions would otherwise slip through while keeping the route green.
- Critical split-sensitive anchors in `src/dashboard-template.ts` currently include board IDs `boardScroll`, `queuedColumn`, `runningColumn`, `retryingColumn`, and `completedColumn`, plus detail-panel controls like `detailPanel`, `closeDetailButton`, `focusLogsButton`, and `refreshDetailButton`.
- Model-routing behavior depends on exact shell markers being present in the HTML string before any browser script runs: `detailModelInput`, `detailReasoningSelect`, `detailModelSource`, `detailModelHelp`, and the `pauseButton` "Save Model" control.
- This repo currently has no standalone `typecheck` script, so `npm run build` is the practical TypeScript compile gate when LSP diagnostics are unavailable in the environment.

## 2026-03-16 Task 8 Smaller Module Seams

- `src/linear-client.ts:130-180` is the safest later seam because the three GraphQL query builders are already pure string factories and can move without changing fetch, paging, logging, or issue normalization behavior.
- `tests/linear-client.test.ts` currently covers normalization more than query composition, so future extraction should first add request-body assertions for project slug filtering, ids query variables, states query variables, paging reuse, and HTTP failure logging.
- `src/config.ts:14-110` already separates coercion and normalization concerns from `deriveServiceConfig(...)`, but startup defaults are only partially characterized today, so fallback, path expansion, approval policy, sandbox policy, and reasoning-effort tests should land before moving helpers.
- `src/http-server.ts:19-43` is the main response-shaping seam, but it is last in the safety order because existing HTTP coverage is broad rather than field-exhaustive and public snake_case payload names must stay frozen before serializer extraction.
- These three modules should stay out of the phase-one oversized-module branch; the later order is Linear query builders first, config helper grouping second, and HTTP serializers last.


## 2026-03-16 F1 Plan Compliance Audit

- The executed branch followed the plan's critical path in order: Task 1 characterization commit landed before the Task 3 `agent-runner` helper extraction, and Task 4 regression gates were recorded before Wave 3 characterization/planning work.
- Relative to `main..HEAD`, the only production source diff is the intended phase-one `agent-runner` extraction (`src/agent-runner.ts` plus new `src/agent-runner-helpers.ts`); there is no structural diff in `src/orchestrator.ts`, `src/dashboard-template.ts`, or `src/attempt-store.ts`.
- Required validation gates were evidenced for every executed planned task: Task 1 (`tests/agent-runner`), Task 3 (`tests/agent-runner` + build), Task 4 (`tests/orchestrator`, `tests/http-server`, full `npm test`), Task 6 (`tests/attempt-store` + `tests/http-server`), and Task 7 (`tests/http-server`).
- Intermediate environment/tooling issues do not break plan compliance when the final required gates are rerun successfully and no scope drift occurs; that pattern appeared in Task 2 (dependencies), Task 3 (missing type import before passing build), and Task 7 (missing TypeScript LSP server).

## 2026-03-16 F2 Code Quality Review

- `src/agent-runner-helpers.ts` keeps a focused boundary for pure agent-runner helpers and does not become a new god module, but `extractUsage` is currently speculative surface: it is exported and imported after extraction without any live call site in the repo.
- The extracted seam preserves local `.js` import conventions in both `src/agent-runner.ts` and `src/agent-runner-helpers.ts`; the quality gate failure is about unused abstraction, not import correctness or module sprawl.

- 2026-03-16: F3 runtime QA should use a dedicated agent-executed script to drive `AgentRunner.runAttempt()` with `tests/fixtures/mock-codex-server.mjs` and then hit live `HttpServer` routes with `fetch()` so approval is based on exercised runtime behavior, not test inference.

## 2026-03-16 F2 Code Quality Re-Run

- After removing `extractUsage`, the `agent-runner` extraction clears the code-quality bar: `src/agent-runner.ts` keeps stateful orchestration concerns, while `src/agent-runner-helpers.ts` is back to a focused set of pure parsing/sanitization helpers.
- For this repo, `npm run build` plus full `npm test` is a strong verification pair for refactor reviews, but the stricter source-health gate is now also available after installing `typescript-language-server` into `~/.local/bin` so `lsp_diagnostics` can run successfully.

## 2026-03-16 F4 Scope Fidelity Rerun

- Re-running `git diff --stat HEAD` after the lockfile revert narrowed the live diff to `.sisyphus/notepads/refactor-oversized-modules/learnings.md`, `src/agent-runner.ts`, and `src/agent-runner-helpers.ts`; `package-lock.json` is now clean and no longer blocks approval.
- `git diff -- src/orchestrator.ts`, `src/dashboard-template.ts`, and `src/attempt-store.ts` all returned empty output, which is the key proof that the branch did not drift into forbidden phase-one structural edits.
- The only remaining production-code delta in the extraction seam is removal of the previously flagged unused `extractUsage(...)` helper/import pair, which reduces speculative surface rather than changing route, payload, or event behavior.
