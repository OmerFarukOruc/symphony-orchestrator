# Symphony Orchestrator — Consolidated Short-Range Plan

> Window: March 24 to April 7, 2026
> Goal: ship the highest-value next sprint without rebuilding what already exists

## Executive Summary

The single most important move is to treat repo routing and end-to-end worktree execution as the correctness gate for the sprint. Symphony already has the hard plumbing for worktrees, post-run commit/push/PR creation, and Linear completion write-back. The biggest remaining risk is not missing infrastructure, but pointing issues at the wrong repo or assuming the full Docker-mounted worktree path is proven when it has not been verified end to end.

Once routing and worktree execution are proven, the highest-ROI product work is operator visibility: make startup progress visible, shorten the polling gap modestly, and add one small Docker startup improvement. Webhooks and container pools are real opportunities, but they should stay out of this sprint.

## Confirmed Baseline

These points should be treated as ground truth for the final plan:

- Git post-run already exists. `executeGitPostRun()` commits, pushes, and opens a PR.
- Linear completion write-back already exists. `worker-outcome.ts` posts a completion comment and can transition to `agent.successState`.
- Worktree setup is implemented and wired when `workspace.strategy` is `worktree`.
- Trusted workspace config is already injected into the container runtime config.
- `bubblewrap` is already present in `Dockerfile.sandbox`.
- Polling still defaults to 30 seconds in both config builder and workflow files.
- `--pull=never` is still missing from Docker run args.
- Startup visibility is still too coarse. Existing events cover claim/launch/completion, but not the quiet middle of startup.
- The setup wizard still does not write `repos:` routing config.
- `RepoRouter` currently checks identifier prefix before labels, so labels cannot override a matching prefix.
- The current `WORKFLOW.md` maps `NIN` to `symphony-orchestrator`. If that is not intentional test-only behavior, it is the first thing to fix.

## Sprint Outcome

By the end of this sprint, Symphony should be able to do all of the following reliably:

- Route a Linear issue to the intended repo with no ambiguous config.
- Create and use a real worktree under Docker, then commit, push, open a PR, and write back to Linear.
- Show operators a visible startup timeline instead of a silent 30 to 60 second gap.
- Pick up new work faster with a safer polling default.
- Let setup-mode users configure the common single-repo case without hand-editing `repos:`.

## Work Block 1 — Correctness Gate: Routing and Worktree Verification

**Priority:** P0
**Why first:** everything else is optimization if the issue-to-repo path is wrong or unproven.

### 1.1 Lock the repo mapping model

- Decide whether `NIN -> symphony-orchestrator` is a deliberate test harness or a real production route.
- If it is production-facing, replace it with the real target repo immediately.
- If Symphony still needs a self-test repo, give that test path a separate prefix or explicit label route instead of overloading `NIN`.

### 1.2 Make label overrides actually override

- Change `RepoRouter.matchIssue()` to evaluate labels before prefix matches.
- Document that labels are the specific override and prefixes are the default fallback.
- Add a unit test for mixed-match cases so this does not regress.

### 1.3 Run a real end-to-end worktree verification

- Set `workspace.strategy: worktree` in a test workflow.
- Use a real Linear test issue against a real target repo.
- Verify:
  - route resolution chooses the expected repo
  - base clone is created under `.base/`
  - worktree is created under `../symphony-workspaces/<ISSUE>/`
  - branch naming is correct
  - agent sees repo files inside Docker
  - post-run commit, push, PR, and Linear completion comment all succeed
  - cleanup removes the worktree cleanly

### Acceptance criteria

- One test issue completes through the full issue -> worktree -> Docker -> commit -> push -> PR -> Linear path.
- No manual git repair is needed during the run.
- The repo route used for the run is explicit and documented.

## Work Block 2 — Operator Visibility: Startup Lifecycle Timeline

**Priority:** P0
**Why second:** this is the biggest UX win once correctness is under control.

### 2.1 Add explicit startup lifecycle events

Add typed events for the currently silent path between dispatch and first meaningful agent work:

- `issue_queued`
- `workspace_preparing`
- `workspace_ready`
- `container_starting`
- `container_running`
- `codex_initializing`
- `thread_started` or explicit equivalent tied to the first real Codex turn

Also add failure variants where they materially improve diagnosis, especially for workspace and container startup failures.

### 2.2 Reuse the existing notification pipeline

- Do not create a second parallel event system.
- Extend the existing notification/event path so backend, SSE, dashboard, and logs stay aligned.
- Include timestamp, issue reference, attempt, and key metadata like workspace path.

### 2.3 Add a startup stepper in the dashboard

- Render the lifecycle as a compact timeline inside each active issue card.
- Show current step, completed steps, and per-step elapsed time.
- Collapse or de-emphasize the stepper once the worker is clearly active.

### Acceptance criteria

- Operators can see where a run is spending time before the first agent response.
- A failed startup tells the operator which stage failed.
- The UI uses the same event source as the rest of the dashboard.

## Work Block 3 — Fast, Low-Risk Responsiveness Wins

**Priority:** P1
**Why now:** these are cheap improvements once the main flow is visible.

### 3.1 Reduce polling from 30s to 15s

- Change the default polling interval to 15 seconds.
- Keep 10 seconds as a fallback option if 15 seconds still feels sluggish after lifecycle visibility ships.
- Do not spend sprint time on webhooks yet.

### 3.2 Add `--pull=never` to Docker runs

- This is the one container startup optimization still worth doing now.
- Skip work already done: trusted runtime config and `bubblewrap` do not belong in the sprint anymore.

### Acceptance criteria

- Default pickup latency is materially lower than today.
- Container startup avoids unnecessary registry checks.
- No change here adds new operator surface area or new lifecycle complexity.

## Work Block 4 — Config Ergonomics: Setup Wizard Repo Routing

**Priority:** P1
**Why this sprint:** it closes the biggest setup gap once the routing model is proven.

### 4.1 Support the single-repo happy path first

Add setup wizard support for:

- repo URL
- default branch
- GitHub owner/repo
- routing key: identifier prefix and optionally label

Persist this into the workflow overlay so users do not have to hand-edit `repos:` for the common case.

### 4.2 Keep scope intentionally narrow

- Do not attempt multi-repo discovery or complex auto-inference in this sprint.
- Make one repo easy before making many repos clever.

### Acceptance criteria

- A fresh setup flow can configure one working repo route end to end.
- The generated overlay is valid and visible to the operator.

## Work Block 5 — Docs, Tests, and Hardening

**Priority:** P1
**Why last:** lock in the proven behavior and prevent backslide.

### 5.1 Tests

- Unit tests for:
  - label-over-prefix route precedence
  - new lifecycle event emission
  - dashboard event rendering logic where practical
- Playwright smoke coverage for the startup stepper
- Manual verification checklist for worktree + Docker + PR + Linear completion

### 5.2 Docs

- Update `WORKFLOW.example.md` to show:
  - `workspace.strategy: worktree` once verified
  - `agent.success_state` example
  - clearer repo routing examples
- Update operator docs with:
  - route precedence rules
  - how to verify a worktree-backed run
  - what the startup timeline states mean

### Acceptance criteria

- The documented happy path matches the implemented one.
- A new operator can configure and verify the feature without guessing.

## Sequencing

Recommended execution order:

1. Routing sanity and real worktree verification
2. Lifecycle events in the backend
3. Startup stepper in the dashboard
4. Poll default to 15s and add `--pull=never`
5. Setup wizard repo-route support
6. Tests and docs hardening

## Explicitly Deferred

These are good ideas, but they should not consume this sprint:

- Linear webhook implementation
- Container pre-warming or warm pools
- Multi-repo auto-detection
- Mid-execution agent-authored Linear updates as a first-class feature
- PR metadata enrichment beyond light polish

## Why This Plan Is Better Than Any Single Draft

- It keeps plan 1's strongest insight: repo mapping and worktree correctness matter more than speed optimizations.
- It keeps plan 2's strongest structure: concrete work blocks with acceptance criteria and bounded scope.
- It keeps plan 3's strongest correction: do not rebuild features that are already implemented and wired.

## Final Recommendation

Treat this sprint as a verification-and-visibility sprint, not an invention sprint. Prove the real repo/worktree/PR/Linear path first, then make it feel fast and legible to operators, then remove setup friction. That sequence gives Symphony the biggest real improvement with the least avoidable risk.
