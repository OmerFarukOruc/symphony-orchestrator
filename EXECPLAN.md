# Symphony v1 Implementation and Delivery Plan

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes the plan contract at `.agent/PLANS.md`. This document must be maintained in accordance with `.agent/PLANS.md` and must stay self-contained so a new contributor can resume from this file alone.

## Purpose / Big Picture

After this change, an operator should be able to run Symphony locally or in Docker, observe it through a self-contained dashboard and Prometheus metrics endpoint, route issues safely through clearer dispatch rules, trust Linear failures to be classified accurately, and continue toward the broader v1 roadmap from a single in-repo execution document. The first visible proof for this implementation slice is smaller but concrete: `GET /metrics` works, Linear pagination fails safely instead of looping forever, dispatch behavior is testable through pure helpers, and the HTML views no longer depend on remote CDNs or hosted fonts.

The implementation request came from `/home/oruc/Desktop/implementation_plan.md`, which is broader than one coding session. The approach here is to translate that external plan into an executable repo-local sequence, land the independent Phase 1 work now, and leave a detailed atomic backlog for the remaining phases so the next contributor can continue without re-discovery.

## Progress

- [x] (2026-03-17 00:16Z) Read `.agent/PLANS.md`, `/home/oruc/Desktop/implementation_plan.md`, `EXECPLAN.md`, and the current repository structure to reconcile the requested roadmap with the actual codebase.
- [x] (2026-03-17 00:19Z) Confirmed the repository already ships pieces assumed by the external plan, including `src/metrics.ts`, archived-attempt storage, and the current dashboard/log pages, so the plan must be adapted rather than copied verbatim.
- [x] (2026-03-17 00:22Z) Replaced the stale prior ExecPlan with this repository-specific living document tied to `/home/oruc/Desktop/symphony-orchestrator`.
- [x] (2026-03-17 02:31Z) Implemented Phase 1.1 in `src/linear-client.ts` and `tests/linear-client.test.ts`: added `LinearErrorCode`, `LinearClientError`, malformed payload detection, transport and HTTP classification, and null-cursor pagination guards in all paginated fetch paths.
- [x] (2026-03-17 02:31Z) Implemented Phase 1.2 in `src/http-server.ts` and `tests/http-server.test.ts`: added `GET /metrics` returning Prometheus text with the expected content type.
- [x] (2026-03-17 02:31Z) Implemented Phase 1.3 in `src/orchestrator/dispatch.ts`, `src/orchestrator.ts`, and `tests/dispatch.test.ts`: extracted pure sorting and blocker helpers and wired the orchestrator to use them.
- [x] (2026-03-17 02:32Z) Implemented Phase 1.4 in `src/dashboard-template.ts` and `src/logs-template.ts`: removed remote CDNs, Google Fonts, and Material Symbols in favor of inline CSS, system fonts, and Unicode icon substitutions.
- [x] (2026-03-17 02:33Z) Ran targeted validation for the changed slices with `npm test -- --run tests/linear-client.test.ts tests/http-server.test.ts tests/orchestrator.test.ts tests/dispatch.test.ts`.
- [x] (2026-03-17 02:33Z) Ran repository validation with `npm test` and `npm run build` from `/home/oruc/Desktop/symphony-orchestrator`.
- [x] (2026-03-17 02:55Z) Implemented Phase 2 notification primitives and wiring: added `src/notification-channel.ts`, `src/slack-webhook.ts`, `src/notification-manager.ts`, parsed notification config in `src/config.ts`, and emitted lifecycle notifications from `src/orchestrator.ts`.
- [x] (2026-03-17 02:55Z) Implemented the main Phase 3 git and GitHub path: added `src/repo-router.ts`, `src/git-manager.ts`, `src/github-api-tool.ts`, registered `github_api` in `src/agent-runner.ts`, and wired orchestrator-side clone/commit/push/PR behavior gated on `SYMPHONY_STATUS: DONE`.
- [x] (2026-03-17 02:56Z) Implemented the main Phase 4 and Phase 6 config surface: added `src/secrets-store.ts`, `src/secrets-api.ts`, `src/config-overlay.ts`, `src/config-api.ts`, and wired `src/cli.ts`, `src/config.ts`, and `src/http-server.ts` so `WORKFLOW.md` remains primary while overlay and secret-backed resolution are additive.
- [x] (2026-03-17 02:56Z) Implemented the main Phase 5 Docker service path: added `src/path-registry.ts`, threaded unified archive and host-path translation through `src/cli.ts`, `src/agent-runner.ts`, and `src/docker-spawn.ts`, and added `Dockerfile`, `docker-compose.yml`, `.env.example`, and `WORKFLOW.docker.md`.
- [x] (2026-03-17 02:56Z) Implemented the main Phase 7 and Phase 10 leaf modules: added `src/state-machine.ts`, `src/planning-skill.ts`, `src/planning-api.ts`, mounted planning routes in `src/http-server.ts`, and added matching test coverage.
- [x] (2026-03-17 02:57Z) Implemented the main Phase 8 and Phase 9 scaffolding: extended `.github/workflows/ci.yml`, added `test:docker` and `test:e2e` scripts plus opt-in integration placeholders, and added the `desktop/` scaffold.
- [x] (2026-03-17 02:57Z) Updated the operator-facing docs for Docker service mode, overlay/secrets APIs, notifications, git automation, and the expanded API surface.
- [x] (2026-03-17 02:57Z) Re-ran full validation after the broader rollout: `npm run build` passed and `npm test` passed with 32 files, 171 tests, and 2 intentionally skipped opt-in integration placeholders.
- [x] (2026-03-17 08:51Z) Finished the remaining planning execution integration: `src/linear-client.ts` now resolves the target Linear project/team/labels and creates issues from `PlannedIssue[]`, `src/planning-executor.ts` exposes the HTTP-facing wrapper, `src/cli.ts` injects the executor, and the planning plus Linear tests cover the happy path and failure handling.
- [x] (2026-03-17 08:52Z) Finished the workflow-state dashboard integration: `src/workflow-columns.ts`, `src/state-policy.ts`, `src/orchestrator.ts`, `src/http-server.ts`, and `src/dashboard-template.ts` now expose and render configurable workflow columns while preserving the legacy queued/running/retrying/completed snapshot fields for backward compatibility.
- [x] (2026-03-17 08:53Z) Finished the desktop lifecycle wiring: `desktop/src-tauri/src/main.rs` now manages `node dist/cli.js` start/stop/status commands, `desktop/web/*` is now a working wrapper UI that embeds the HTTP dashboard, and the desktop docs/config were updated to match the real behavior.
- [x] (2026-03-17 08:54Z) Re-ran the full repository validation after the final integrations: `npm test` passed with 33 files, 176 tests, and 2 intentionally skipped opt-in integration placeholders; `npm run build` passed; `node --check desktop/web/app.js` passed; and `desktop/src-tauri/tauri.conf.json` parsed successfully.
- [ ] (2026-03-17 08:55Z) Push the finished work to `origin/main` (completed: implementation, docs, TypeScript validation, desktop wrapper asset checks; remaining: GitHub push is still blocked until HTTPS credentials are available on this machine, and Rust/Tauri compilation could not be validated locally because `cargo` is not installed here).
- [x] (2026-03-18 12:45Z) Implemented visual verification skill: created `agent-browser.json` (Brave headed mode config), `skills/visual-verify/SKILL.md` (merged agent-browser core + dogfood QA), `references/dashboard-map.md`, `references/command-reference.md`, `references/issue-taxonomy.md`, `templates/verification-report-template.md`. Updated `AGENTS.md` with browser automation section, `.gitignore` with screenshot/output patterns. Updated `OPERATOR_GUIDE.md`, `ROADMAP_AND_STATUS.md`, and `README.md` to document the new skill.

## Surprises & Discoveries

- Observation: the checked-in `EXECPLAN.md` was still oriented around an earlier repository path and earlier project state.
  Evidence: the previous file referred to `/home/oruc/Desktop/codex` and described the current dashboard as still depending on remote assets, which is a useful reminder but no longer a sufficient restart guide for this repository.

- Observation: the repo already contains a Prometheus collector in `src/metrics.ts`, but it is not yet wired into the HTTP surface or the orchestration loops.
  Evidence: `rg -n "globalMetrics|orchestratorPollsTotal|agentRunsTotal" src tests` found definitions in `src/metrics.ts` and tests in `tests/metrics.test.ts`, but no integration points elsewhere.

- Observation: the external implementation plan assumes dispatch sorting and blocker checks are still embedded in the orchestrator, and that is still true here.
  Evidence: `src/orchestrator.ts` currently contains private methods `sortIssuesForDispatch()` and `canDispatchIssue()` with inline blocker logic around line 924.

- Observation: the dashboard and log viewer still rely on remote Tailwind, Google Fonts, and Material Symbols, which would break in an offline or no-network environment.
  Evidence: `src/dashboard-template.ts` and `src/logs-template.ts` contain `cdn.tailwindcss.com`, `fonts.googleapis.com`, and `material-symbols-outlined` references.

- Observation: the Phase 1 work split cleanly across independent slices, and the repo tolerated parallel implementation well because the write sets were naturally disjoint.
  Evidence: the Linear client, dispatch and metrics, and HTML template changes landed without overlapping file ownership and the combined validation still passed.

- Observation: the dashboard conversion did not need a utility-for-utility Tailwind clone to stay functional.
  Evidence: after replacing remote assets with inline semantic CSS and Unicode icons, `npm test`, `npm run build`, and `rg -n "cdn.tailwindcss.com|fonts.googleapis.com|material-symbols-outlined" src/dashboard-template.ts src/logs-template.ts` all succeeded.

- Observation: most of the post-Phase-1 roadmap fit naturally as leaf modules plus a small number of high-conflict integration files.
  Evidence: the later rollout landed primarily in new files such as `src/notification-manager.ts`, `src/config-overlay.ts`, `src/path-registry.ts`, `src/state-machine.ts`, and `src/planning-api.ts`, while the shared glue concentrated in `src/cli.ts`, `src/config.ts`, `src/http-server.ts`, `src/agent-runner.ts`, and `src/orchestrator.ts`.

- Observation: a strict `MASTER_KEY` requirement at service startup would have broken existing workflows before the secrets feature was used.
  Evidence: the initial `SecretsStore` implementation threw immediately without `MASTER_KEY`; the final integration changed that to a disabled-until-configured posture unless an existing encrypted secrets file is already present.

- Observation: the repo already contained part of the “remaining” work as dormant modules, which made the last integrations smaller than they first appeared.
  Evidence: `src/linear-client.ts` already included `createIssuesFromPlan()` and its GraphQL helpers, while `src/workflow-columns.ts`, `src/state-policy.ts`, and `src/types.ts` already defined workflow-column structures that only needed wiring into the snapshot, HTTP serializer, and dashboard renderer.

- Observation: the desktop shell can be completed meaningfully without touching the orchestration core, but local Rust validation depends on toolchain availability outside the Node test path.
  Evidence: the final desktop work stayed confined to `desktop/*`, and the plain-file checks (`node --check desktop/web/app.js`, JSON parse for `desktop/src-tauri/tauri.conf.json`) passed, while `cargo` commands were unavailable on this machine.

## Decision Log

- Decision: adapt `/home/oruc/Desktop/implementation_plan.md` into a repository-local execution document instead of treating it as a literal file-by-file patch list.
  Rationale: the external plan targets a broader v1 scope and an earlier repository state. This repository already ships some later concepts and uses different paths, so a fresh in-repo ExecPlan is necessary for safe continuation.
  Date/Author: 2026-03-17 / Codex

- Decision: implement the work in milestone order, but land the independent Phase 1 slices in parallel because the user explicitly asked for multiple subagents and the slices do not share a write set.
  Rationale: Linear transport, observability/dispatch plumbing, and static-asset removal can be developed independently and merged with low risk while keeping momentum high during an unattended session.
  Date/Author: 2026-03-17 / Codex

- Decision: preserve the existing operator-facing HTML structure and DOM ids while removing remote dependencies, rather than redesigning the UI.
  Rationale: the tests and current browser behavior already key off those ids. Phase 1 needs an offline-safe equivalent, not a new interface contract.
  Date/Author: 2026-03-17 / Codex

- Decision: use Unicode and text icon substitutes instead of bundling a local icon font as part of Phase 1.
  Rationale: the goal of this slice was offline-safe behavior with minimal moving parts. Unicode substitutions were enough to preserve structure and meaning without adding a new asset pipeline.
  Date/Author: 2026-03-17 / Codex

- Decision: make the new runtime layers additive and optional wherever possible, even when the external roadmap described them as headline features.
  Rationale: the repository already had a stable local operator flow. Notifications, git automation, secrets, overlay config, Docker service packaging, and planning were integrated so that existing workflows still build and test cleanly without mandatory new environment variables or external services.
  Date/Author: 2026-03-17 / Codex

- Decision: collapse the remaining planning execution work into `LinearClient.createIssuesFromPlan()` and keep `src/planning-executor.ts` as the HTTP-facing adapter.
  Rationale: the repo already had partial planning execution plumbing and the existing GraphQL client was the safest place to centralize project/team/label lookup and issue creation behavior.
  Date/Author: 2026-03-17 / Codex

- Decision: preserve the runtime-oriented top-bar filters while rendering the board itself from workflow columns.
  Rationale: operators still need the quick `running` / `retrying` / `completed` lens, but the board must now reflect configurable state-machine stages. Keeping both avoided a user-visible regression.
  Date/Author: 2026-03-17 / Codex

- Decision: implement the desktop host as a thin Tauri lifecycle wrapper around `node dist/cli.js`.
  Rationale: reusing the built CLI avoided inventing a second service protocol and kept the desktop work isolated to `desktop/*`.
  Date/Author: 2026-03-17 / Codex

## Outcomes & Retrospective

The repo is now materially further along than the original Phase 1 checkpoint. In addition to the landed metrics, Linear hardening, dispatch extraction, and offline HTML templates, the current tree includes notification primitives plus orchestration wiring, optional git routing and PR automation, encrypted secrets and config overlay stores with local APIs, Docker service packaging artifacts, state-machine and planning leaf modules, CI/test entrypoint extensions, and a working desktop shell. The unattended-session goal also landed: this ExecPlan remains the restart document for the current tree and records the remaining gaps explicitly.

The latest validation evidence is stronger than the earlier Phase 1 pass. `npm run build` succeeds, `npm test` now passes with 33 files and 176 tests, and only 2 opt-in integration placeholders are skipped behind environment flags. The previously remaining integration gaps are now closed: planning execution creates real Linear issues through the existing GraphQL client, the dashboard renders configurable workflow-state columns while keeping the legacy snapshot fields available, and the desktop shell can start/stop the local service and embed the existing dashboard. The main remaining risks are operational rather than implementation breadth: GitHub push still depends on host credentials, and Tauri/Rust compilation could not be re-verified locally because `cargo` is unavailable on this machine.

The main lesson from the full unattended pass is that broad roadmaps become tractable when decomposed into leaf modules plus a small set of integration seams. Parallel delegation worked well because the ownership boundaries were explicit, while the final shared-file integration stayed local and test-driven.

## Context and Orientation

The repository root is `/home/oruc/Desktop/symphony-orchestrator`. The main entry point is `src/cli.ts`, which reads a workflow file, builds a `ConfigStore`, initializes persistence, starts the orchestrator, and serves the local HTTP interface. `src/orchestrator.ts` is the control loop that polls Linear, sorts candidate issues, manages retries, launches workers, and assembles runtime snapshots. `src/agent-runner.ts` wraps the Codex app-server protocol and Docker runtime wiring. `src/http-server.ts` exposes the dashboard at `/` plus the JSON API under `/api/v1/*`. `src/linear-client.ts` is the GraphQL client for Linear, and its failure classification matters because the orchestrator depends on predictable retry behavior.

A “dispatch helper” in this plan means a pure function that can be called without constructing the whole orchestrator class. This matters because sorting and blocker checks are easier to test and reason about when they do not depend on timers, stateful maps, or network calls. A “typed Linear error” means a normal JavaScript `Error` subclass whose `code` property tells the rest of the service whether the failure came from transport, HTTP status, GraphQL errors, malformed payloads, or an impossible pagination response.

The external roadmap file, `/home/oruc/Desktop/implementation_plan.md`, defines ten phases. This ExecPlan keeps those phases but translates them to the actual repository layout. The immediate implementation focus is Phase 1 because it is self-contained, operator-visible, and safe to validate in one turn.

## Plan of Work

The first milestone is to harden the Linear client in `src/linear-client.ts`. Add an exported error-code type and `LinearClientError` class there, wrap `fetch()` rejections so they become `linear_transport_error`, classify non-2xx responses as `linear_http_error`, classify GraphQL `errors[]` payloads as `linear_graphql_error`, detect missing or malformed `data.issues` payloads as `linear_unknown_payload`, and stop pagination when `hasNextPage` is true but `endCursor` is null by throwing `linear_missing_end_cursor`. Update `tests/linear-client.test.ts` so each failure mode is explicit and deterministic.

The second milestone is to make observability and dispatch behavior easier to inspect. In `src/http-server.ts`, add a `GET /metrics` route that returns `globalMetrics.serialize()` with the Prometheus content type. Also add lightweight request metrics collection around the HTTP routes if doing so stays local to the existing server structure. Extract dispatch helpers from `src/orchestrator.ts` into `src/orchestrator/dispatch.ts` so sorting and blocker checks are pure exported functions. Update `src/orchestrator.ts` to call those helpers instead of private inline logic. Add `tests/dispatch.test.ts` for sort order and blocker behavior, and extend `tests/http-server.test.ts` to verify `/metrics`.

The third milestone is to remove remote asset dependencies from the HTML pages. In `src/dashboard-template.ts`, replace the Tailwind CDN, Google Fonts, and Material Symbols usage with inline CSS, system font stacks, and text or Unicode icon substitutes. Do the same in `src/logs-template.ts`. Preserve all existing element ids and browser-side script hooks so the rest of the code and tests remain valid. Favor small semantic class names and shared inline styles over trying to recreate every Tailwind utility exactly.

Once those edits land, run the targeted tests for the changed areas and then the full repository validation commands. Update the `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, `Concrete Steps`, `Validation and Acceptance`, and `Artifacts and Notes` sections with the real results. Only after Phase 1 is green should work continue into notifications, git automation, secrets, Docker path translation, overlay config, state machines, CI hardening, desktop packaging, and planning APIs.

## Concrete Steps

All commands in this section must be run from `/home/oruc/Desktop/symphony-orchestrator`.

1. Read the current implementation and tests before editing:

       sed -n '1,260p' src/linear-client.ts
       sed -n '1,260p' src/http-server.ts
       sed -n '880,980p' src/orchestrator.ts
       sed -n '1,280p' tests/linear-client.test.ts
       sed -n '1,280p' tests/http-server.test.ts

2. Implement the Linear error and pagination changes in `src/linear-client.ts` and update `tests/linear-client.test.ts`.

3. Add `src/orchestrator/dispatch.ts`, update `src/orchestrator.ts`, and add or extend the dispatch and HTTP tests.

4. Replace the remote assets in `src/dashboard-template.ts` and `src/logs-template.ts` with inline CSS and local icon substitutions.

5. Run focused validation while iterating:

       npm test -- --run tests/linear-client.test.ts tests/http-server.test.ts tests/orchestrator.test.ts tests/dispatch.test.ts

   Observed result on 2026-03-17: Vitest passed with 4 files and 35 tests. The targeted run covered the new Linear error taxonomy, `/metrics`, the dispatch helper extraction, and the orchestrator dispatch path.

6. Run the full repository validation:

       npm test
       npm run build

   Observed result on 2026-03-17 after the final integration pass: the full Vitest suite passed with 33 files and 176 tests, and `npm run build` completed successfully.

7. Confirm the HTML templates are offline-safe:

       rg -n "cdn.tailwindcss.com|fonts.googleapis.com|material-symbols-outlined" src/dashboard-template.ts src/logs-template.ts

   Observed result on 2026-03-17: no matches.

8. Record the outcome in this file with timestamps and short evidence snippets.

## Validation and Acceptance

Phase 1 is accepted only when all of the following are true. These conditions were met on 2026-03-17.

First, `tests/linear-client.test.ts` proves each Linear failure mode separately. A rejected `fetch()` call must produce `LinearClientError` with code `linear_transport_error`. A non-200 HTTP response must produce `linear_http_error`. A successful HTTP response that contains GraphQL `errors[]` must produce `linear_graphql_error`. A malformed success payload must produce `linear_unknown_payload`. A paginated response with `hasNextPage: true` and `endCursor: null` must produce `linear_missing_end_cursor` instead of looping.

Second, `tests/http-server.test.ts` proves `GET /metrics` returns HTTP 200 and a Prometheus text body with the expected content type. If request metrics instrumentation is added, the test should also confirm that at least one expected metric name appears in the response body.

Third, the new dispatch tests prove that sorting is by priority first, then oldest `createdAt`, then `identifier`, and that blocked todo issues are filtered when any blocker is not in a terminal state. This behavior must be driven through pure helpers so the tests do not need to spin up a whole orchestrator to cover simple ordering logic.

Fourth, `npm test` and `npm run build` pass. This was reconfirmed on 2026-03-17 after the final integration work with a full Vitest pass of 33 files and 176 tests plus a successful TypeScript build. The HTML templates must no longer contain `cdn.tailwindcss.com`, `fonts.googleapis.com`, or `material-symbols-outlined`, so a contributor can confirm offline safety by searching the files directly:

       rg -n "cdn.tailwindcss.com|fonts.googleapis.com|material-symbols-outlined" src/dashboard-template.ts src/logs-template.ts

   Observed result on 2026-03-17: no matches.

## Idempotence and Recovery

All edits in this plan are source-only and safe to apply incrementally. Re-running the tests or the build is safe and expected. If a partial edit leaves the codebase failing, continue from this file by finishing the current incomplete `Progress` item rather than reverting unrelated work. If the static asset conversion introduces layout regressions, keep the DOM ids and browser script contract intact, then simplify the styling further instead of restoring remote CDNs. If a new test exposes an existing bug outside the current write set, record that in `Surprises & Discoveries` and continue only if the failure is directly caused by this feature slice.

## Artifacts and Notes

Important evidence gathered before implementation:

    $ rg -n "globalMetrics|orchestratorPollsTotal|agentRunsTotal" src tests
    src/metrics.ts:94:export const globalMetrics = new MetricsCollector();
    tests/metrics.test.ts:40:    metrics.orchestratorPollsTotal.increment({ status: "ok" });

    $ rg -n "cdn.tailwindcss.com|fonts.googleapis.com|Material\\+Symbols|material-symbols-outlined" src/dashboard-template.ts src/logs-template.ts
    src/dashboard-template.ts:8:  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
    src/logs-template.ts:14:  <link href="https://fonts.googleapis.com/css2?family=Inter...

    $ git status --short
     M AGENTS.md
    ?? .agent/

The existing `AGENTS.md` modification and the untracked `.agent/` directory were present before this implementation work. They are not part of this feature slice and must not be reverted.

Important evidence gathered after implementation:

    $ npm test -- --run tests/linear-client.test.ts tests/http-server.test.ts tests/orchestrator.test.ts tests/dispatch.test.ts
    Test Files  4 passed (4)
    Tests  35 passed (35)

    $ npm test
    Test Files  31 passed | 2 skipped (33)
    Tests  174 passed | 2 skipped (176)

    $ npm run build
    > tsc -p tsconfig.json

    $ node --check desktop/web/app.js
    [no output]

    $ python - <<'PY'
    import json, pathlib
    json.loads(pathlib.Path("desktop/src-tauri/tauri.conf.json").read_text())
    print("ok")
    PY
    ok

    $ rg -n "cdn.tailwindcss.com|fonts.googleapis.com|material-symbols-outlined" src/dashboard-template.ts src/logs-template.ts
    [no output]

## Interfaces and Dependencies

At the end of Phase 1, `src/linear-client.ts` must export:

    export type LinearErrorCode =
      | "linear_transport_error"
      | "linear_http_error"
      | "linear_graphql_error"
      | "linear_unknown_payload"
      | "linear_missing_end_cursor";

    export class LinearClientError extends Error {
      readonly code: LinearErrorCode;
    }

At the end of Phase 1, `src/orchestrator/dispatch.ts` must export pure functions with signatures equivalent to:

    export function sortIssuesForDispatch(issues: Issue[]): Issue[];
    export function isBlockedByNonTerminal(issue: Issue, config: ServiceConfig): boolean;
    export function canDispatchIssue(
      issue: Issue,
      options: { claimedIssueIds: ReadonlySet<string>; config: ServiceConfig }
    ): boolean;

The exact helper names may vary slightly if the implementation remains equally clear, but the functions must stay pure and directly testable.

At the end of Phase 1, `src/http-server.ts` must expose `GET /metrics` that returns `globalMetrics.serialize()` with:

    Content-Type: text/plain; version=0.0.4; charset=utf-8

Revision note: on 2026-03-17 this ExecPlan was rewritten because the previous file still described an earlier repository path and an outdated project snapshot. The new version aligns the plan with `/home/oruc/Desktop/symphony-orchestrator`, decomposes the requested external roadmap into atomic repository tasks, and sets Phase 1 as the active implementation milestone.

Revision note: later on 2026-03-17 the ExecPlan was updated again to reflect the completed final integrations. The planning execution backend, workflow-column dashboard rendering, and desktop lifecycle shell are now recorded as landed work, validation evidence has been refreshed to the current `npm test` and `npm run build` results, and the remaining blockers were narrowed to push credentials plus unavailable local Rust tooling.

## 2026-03-21 Next Slice: Desktop-First Dashboard Frontend Refresh

This section is a new execution slice for the Vite frontend under `frontend/`. It is intentionally scoped to desktop and large-tablet operator usage only. Mobile and narrow-screen redesign work is explicitly deferred to a later slice and must not be mixed into this implementation unless the scope changes.

### Purpose / Big Picture

After this change, an operator using Symphony on a desktop-class viewport should experience the dashboard as a coherent control plane rather than a collection of themed pages. The visible improvement should be structural, not cosmetic: clearer hierarchy, more trustworthy queue semantics, a calmer issue drawer, stronger overview storytelling, and denser-but-more-readable logs and observability surfaces. The first proof is visual and behavioral rather than backend-oriented: the same live data should read faster, require less scanning, and produce fewer state ambiguities without changing the underlying API contract.

### Scope Boundaries

In scope for this slice:

- Desktop and large-tablet layout quality for the shell, overview, queue, issue drawer, logs, and observability pages.
- Information hierarchy, surface treatment, spacing, typography, motion, and operator-facing copy adjustments.
- Queue board visual semantics, especially the distinction between workflow stage and runtime status.
- Refactoring frontend components and CSS tokens where necessary to support the design cleanup.

Out of scope for this slice:

- Mobile and narrow-screen redesign, responsive shell conversion, off-canvas navigation, and phone-specific layouts.
- New backend endpoints, new orchestration features, or changes to the persisted snapshot schema unless a frontend bug cannot be fixed without them.
- Replacing the existing frontend stack or introducing a new UI framework.

### Progress

- [x] (2026-03-21 10:41Z) Reviewed the live frontend on `http://127.0.0.1:4173` against the running local backend on `http://127.0.0.1:4000` and captured current screenshots for overview, queue, queue drawer, logs, and observability.
- [x] (2026-03-21 10:46Z) Confirmed the immediate next roadmap should be desktop-first and that mobile/responsive work is intentionally deferred from this execution slice.
- [x] (2026-03-21 10:51Z) Read the current frontend structure in `frontend/src/{pages,components,views,styles,ui}` and identified the main design seams: shell hierarchy, page-header system, queue semantics, drawer composition, and logs layout rigidity.
- [ ] Define the new surface hierarchy and page-header rules in shared styles and components before touching page-specific composition.
- [ ] Implement desktop shell and hierarchy cleanup without changing the current route model or keyboard flow.
- [ ] Rework overview, queue, issue drawer, logs, and observability in that order, validating after each milestone with browser screenshots and targeted regression checks.
- [ ] Run repository validation and a desktop visual QA pass, then update this ExecPlan section with shipped outcomes, surprises, and evidence.

### Current Diagnosis

- The visual identity is already strong enough to keep: the copper/slate palette in `frontend/src/styles/design-system.css`, the `Space Grotesk` + `Manrope` typography pairing, and the dark operator-tool framing should stay.
- The current weakness is not lack of styling; it is over-equalized hierarchy. `mc-strip`, `mc-toolbar`, `mc-panel`, and `mc-stat-card` all read too similarly, so the UI spends too much visual energy boxing content instead of directing attention.
- The queue board currently mixes workflow stage and runtime status in a way that can confuse operators. A card can sit inside an “In Progress” column while visually presenting itself as “Done” or “Completed”. That ambiguity must be resolved at the design layer before polish work.
- The issue drawer contains useful information but presents it in a metadata-first order. Operators need object identity, present state, and next action first; static fields can follow.
- The logs page is functionally good but structurally brittle because it depends on fixed viewport math and a visually uniform stripe list.
- The observability page is the strongest reference surface and should guide the rest of the redesign rather than being redesigned independently in a conflicting direction.

### Surprises & Discoveries

- Observation: the current live backend state can already expose contradictory-feeling queue visuals without any frontend bug in routing.
  Evidence: during live review on 2026-03-21, `/api/v1/state` returned completed issues inside the `workflow_columns` entry labeled `"In Progress"`, while the queue cards rendered completed-style badges from item status. This means the redesign must make stage-versus-runtime semantics explicit instead of assuming upstream data will always be intuitively aligned.

- Observation: the current frontend is already modular enough that the redesign can be staged safely.
  Evidence: the shell, page headers, queue board, issue drawer, and observability sections each have distinct component/style files such as `frontend/src/ui/shell.ts`, `frontend/src/components/page-header.ts`, `frontend/src/pages/queue-view.ts`, `frontend/src/components/issue-inspector.ts`, and `frontend/src/views/observability-sections.ts`.

- Observation: the main dashboard quality gap is composition, not missing affordances.
  Evidence: the live UI already has keyboard navigation, command palette entry points, drawer routing, filters, and status chips; what feels weak is relative emphasis, grouping, and reading order.

- Observation: mobile breakpoints are not just “unfinished”; they are a separate architectural problem.
  Evidence: a phone-width browser pass at `390x844` showed the desktop rail remaining inline and consuming a large portion of the viewport, which is incompatible with the desktop-first goals of this slice and should stay out of scope for now.

### Decision Log

- Decision: keep this execution slice desktop-first and explicitly defer mobile/responsive work.
  Rationale: the shell architecture and viewport tradeoffs for mobile are substantial enough that bundling them into the visual refresh would dilute focus and slow the main desktop operator improvements.
  Date/Author: 2026-03-21 / Codex

- Decision: treat observability as the reference page for quality and restraint.
  Rationale: among the current pages, observability already shows the clearest large-number hierarchy, strongest sectional grouping, and most cohesive visual identity.
  Date/Author: 2026-03-21 / Codex

- Decision: fix visual semantics before decorative polish.
  Rationale: queue state trustworthiness, drawer information order, and page hierarchy are operator-facing correctness problems, not mere aesthetics. Those need to be settled before motion or micro-polish work.
  Date/Author: 2026-03-21 / Codex

- Decision: keep the current frontend stack and route structure intact.
  Rationale: the current Vite app already has sufficient modularity and the redesign should reduce risk by preserving router, API client, store, and keyboard contracts unless a concrete implementation blocker appears.
  Date/Author: 2026-03-21 / Codex

### Plan of Work

The first milestone is to establish a shared desktop hierarchy system. Update the shared surface primitives in `frontend/src/styles/components.css`, the shell framing in `frontend/src/styles/shell.css`, and the reusable header helper in `frontend/src/components/page-header.ts` so the app has clearer distinctions between primary command areas, normal work surfaces, and quiet support surfaces. This milestone should not yet redesign specific pages beyond what is necessary to prove the new hierarchy works.

The second milestone is the queue and issue-detail axis, because this is the operational core of the product. Update `frontend/src/pages/queue-view.ts`, the queue board renderer and toolbar helpers, `frontend/src/components/kanban-card.ts`, `frontend/src/components/issue-inspector.ts`, `frontend/src/components/issue-inspector-sections.ts`, and the related style files (`frontend/src/styles/kanban.css`, `frontend/src/styles/queue.css`, `frontend/src/styles/issue.css`) so workflow stage, runtime status, and operator actions no longer compete visually. The board should read by stage first, while per-card runtime state becomes a secondary but still visible signal.

The third milestone is the overview page. Redesign `frontend/src/pages/overview-view.ts` and `frontend/src/styles/overview.css` so the page tells a stronger operational story: what needs attention now, what is active now, and what changed recently. The current equal-weight card mosaic should be replaced by a more decisive composition that still works when data is sparse.

The fourth milestone is the logs page. Refine `frontend/src/pages/logs-view.ts`, `frontend/src/components/log-row.ts`, and `frontend/src/styles/logs.css` so the logs surface behaves like a durable reading tool instead of a brittle fixed-height list. Replace hard-coded layout math with a layout that survives shell/header changes, preserve live/archive mode and filters, and tighten the timestamp/type/message rhythm for faster scanning.

The fifth milestone is observability polish. Reuse the successful aspects of `frontend/src/views/observability-view.ts`, `frontend/src/views/observability-sections.ts`, and `frontend/src/styles/observability.css`, but give the page a clearer first-read hierarchy by promoting the most actionable metrics and reducing the visual dominance of secondary raw-data chrome.

The final milestone is polish and validation. Run the desktop visual pass again across all touched routes, verify there are no console or page errors, run the repository’s frontend and repo-wide validation commands, and update this ExecPlan with the real shipped outcome plus any follow-up backlog that should remain explicitly deferred.

### Concrete Steps

All commands in this section must be run from `/home/oruc/Desktop/codex`.

1. Re-open the key frontend files before editing so the redesign starts from the actual current structure:

       sed -n '1,220p' frontend/src/components/page-header.ts
       sed -n '1,240p' frontend/src/pages/overview-view.ts
       sed -n '1,220p' frontend/src/pages/queue-view.ts
       sed -n '1,260p' frontend/src/components/issue-inspector.ts
       sed -n '1,260p' frontend/src/components/issue-inspector-sections.ts
       sed -n '1,260p' frontend/src/pages/logs-view.ts
       sed -n '1,240p' frontend/src/views/observability-view.ts

2. Implement the shared hierarchy pass first:

       frontend/src/styles/components.css
       frontend/src/styles/shell.css
       frontend/src/components/page-header.ts

   Acceptance target: page headers, toolbars, and work surfaces no longer share the same visual weight by default.

3. Implement the queue and issue-detail redesign second:

       frontend/src/pages/queue-view.ts
       frontend/src/pages/queue-board.ts
       frontend/src/pages/queue-toolbar.ts
       frontend/src/components/kanban-card.ts
       frontend/src/components/issue-inspector.ts
       frontend/src/components/issue-inspector-sections.ts
       frontend/src/styles/kanban.css
       frontend/src/styles/queue.css
       frontend/src/styles/issue.css

   Acceptance target: board columns communicate workflow stage first; cards communicate runtime status second; the drawer leads with identity, state, and next action.

4. Implement the overview redesign third:

       frontend/src/pages/overview-view.ts
       frontend/src/styles/overview.css

   Acceptance target: the page can be understood by scanning only the major headings, KPI labels, and event summaries.

5. Implement the logs redesign fourth:

       frontend/src/pages/logs-view.ts
       frontend/src/components/log-row.ts
       frontend/src/styles/logs.css

   Acceptance target: the logs layout no longer depends on `height: calc(100vh - ...)` and still behaves correctly with the shell/header in place.

6. Implement the observability polish fifth:

       frontend/src/views/observability-view.ts
       frontend/src/views/observability-sections.ts
       frontend/src/views/observability-cards.ts
       frontend/src/styles/observability.css

   Acceptance target: the page retains its current strengths while presenting a clearer first-read priority order.

7. Run targeted validation while iterating:

       npm run typecheck:frontend
       npm run build
       npm test

8. Run desktop visual verification after each major milestone or at minimum after milestones 2, 4, and 6:

       agent-browser --session ui-review open http://127.0.0.1:4173/
       agent-browser --session ui-review screenshot archive/screenshots/overview-after.png
       agent-browser --session ui-review open http://127.0.0.1:4173/queue
       agent-browser --session ui-review screenshot archive/screenshots/queue-after.png
       agent-browser --session ui-review open http://127.0.0.1:4173/issues/NIN-21/logs
       agent-browser --session ui-review screenshot archive/screenshots/logs-after.png
       agent-browser --session ui-review open http://127.0.0.1:4173/observability
       agent-browser --session ui-review screenshot archive/screenshots/observability-after.png
       agent-browser --session ui-review errors
       agent-browser --session ui-review console

9. Update this ExecPlan section with real timestamps, observed validation output, and any design debt intentionally deferred after the implementation lands.

### Validation and Acceptance

This slice is accepted only when all of the following are true.

First, the desktop shell and page hierarchy clearly distinguish primary operational surfaces from supporting chrome. The visual proof is that the main work region on overview, queue, logs, and observability is obvious on first scan without relying on hover or route familiarity.

Second, queue semantics are clearer than the current baseline. A user should be able to tell the difference between workflow stage and runtime state without reading contradictory primary signals. The final queue visuals must not imply that the same status is simultaneously the column’s main meaning and the card’s main meaning when those differ.

Third, the issue drawer must present operator context in a cleaner order. The first visible region should identify the issue, show its current state, and offer the most relevant actions. Description/activity must not be buried under low-priority metadata.

Fourth, the logs page must remain stable without fixed viewport subtraction math. The scrolling container must still behave correctly, but the layout should survive reasonable shell/header changes without re-tuning a magic number.

Fifth, observability must remain at least as legible as it is today and should become more decisive about what matters first. The redesign must not flatten it back into a generic card grid.

Sixth, `npm run typecheck:frontend`, `npm run build`, and `npm test` must all pass after the slice lands.

Seventh, a desktop visual QA pass across `/`, `/queue`, `/issues/:id/logs`, and `/observability` must complete without browser console or page errors.

### Idempotence and Recovery

All work in this slice should be safe to land incrementally because the frontend is already modularized by page and shared primitive. If a partial redesign produces a worse hierarchy, continue by finishing the current milestone rather than reverting unrelated cleanup. If a page-specific change reveals that a shared primitive is too rigid, refactor the primitive and keep the page-specific diff small instead of forking one-off styles. If a proposed change starts drifting into mobile behavior, stop and record that drift as deferred work rather than solving it opportunistically.

### Artifacts and Notes

Important evidence gathered before implementation of this slice:

    $ curl -sS -i http://127.0.0.1:4000/
    HTTP/1.1 200 OK

    $ curl -sS -i http://127.0.0.1:4000/api/v1/state
    HTTP/1.1 200 OK

    $ agent-browser --session ui-review screenshot archive/screenshots/overview.png
    $ agent-browser --session ui-review screenshot archive/screenshots/queue.png
    $ agent-browser --session ui-review screenshot archive/screenshots/queue-drawer.png
    $ agent-browser --session ui-review screenshot archive/screenshots/logs.png
    $ agent-browser --session ui-review screenshot archive/screenshots/observability.png

Desktop review note from 2026-03-21: the strongest current page is observability, the most urgent clarity problem is queue semantics plus drawer information order, and mobile behavior was intentionally deferred from this roadmap after a narrow-width sanity pass showed it needs its own architectural slice.
