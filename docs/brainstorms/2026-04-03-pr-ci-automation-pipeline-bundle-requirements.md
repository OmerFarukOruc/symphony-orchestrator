---
date: 2026-04-03
topic: pr-ci-automation-pipeline-bundle
---

# PR/CI Automation Pipeline Bundle

## Problem Frame

Symphony agents complete work, create PRs, and walk away. The gap between "PR created" and "merged or abandoned" is a black box: Linear issues stay open, operators must manually check GitHub, review feedback goes unacted on, and the workspace lingers indefinitely. This bundle closes that loop — 6 features that together create a self-documenting, feedback-aware, lifecycle-complete PR pipeline.

**Issues:** #275, #335, #333, #258, #307, #375

## Lifecycle Flow

```
Agent completes work
       │
       ├──▶ [#275] Post completion comment to Linear (success + failure)
       │
       ├──▶ [#335] Generate PR summary from git diff → inject into PR body
       │
       ▼
  PR created
       │
       ├──▶ [#258] Evaluate auto-merge policy → request auto-merge if CI passes
       │
       ├──▶ [#307] Monitor PR status (60s poll) → detect merge/close
       │    │
       │    └──▶ [#375] Write checkpoint at merge/archive event
       │
       └──▶ [#333] Ingest review comments → make available for retry-with-context
                   (auto-queue configurable via settings)
```

## Requirements

**Tracker Writeback (#275)**
- R1. On successful agent completion, post a structured comment to the Linear issue containing: turns completed, duration (seconds), input/output/total token counts, and USD cost.
- R2. On failure (retries exhausted), post a failure comment to the Linear issue containing: error reason, attempt count, and elapsed time.
- R3. On successful completion, transition the issue state to the configured terminal-success state (default: "Done").
- R4. Comment post and state transition are independent operations — failure of one must not block the other.
- R5. All writeback failures are logged at warn level and must not affect orchestrator internal state.

**PR Summary Generation (#335)**
- R6. After agent completes work, run a summary generation step that invokes `git diff main...HEAD` and produces a 3–8 bullet markdown summary of all changes.
- R7. The summary is injected into the PR body under a "Changes" heading when available.
- R8. The summary is stored in the attempt record for historical reference.
- R9. The summary file artifact is cleaned up and not committed to the branch.
- R10. If summary generation fails, the PR is created without a summary section (graceful degradation).

**PR Review Feedback Ingestion (#333)**
- R11. When retrying an issue that has an existing open PR, fetch all review bodies and PR-level comments from GitHub.
- R12. Fetched feedback is injected into the agent prompt under a "Previous PR Review Feedback" section on retry.
- R13. On re-run, the branch is force-pushed with `--force-with-lease` to update the existing PR rather than creating a new one.
- R14. A "fresh" mode option closes the existing PR and starts from a new branch.
- R15. Auto-retry-on-review-feedback is operator-configurable via settings (default: off). When enabled, detecting "changes requested" reviews automatically queues a re-run with feedback.
- R16. Inline line-level review comments are included alongside general PR-level comments in the ingested feedback.

**Auto-Merge Policy Engine (#258)**
- R17. A `MergePolicy` type and `evaluateMergePolicy()` function determine whether a PR qualifies for auto-merge.
- R18. The policy evaluates: allowed path prefixes, max changed file count, max diff lines (additions + deletions), required labels, and excluded labels.
- R19. Auto-merge is disabled by default. Operators opt in via settings.
- R20. Auto-merge is requested via the GitHub API only when: (a) the policy passes, and (b) all required CI status checks are passing.
- R21. PRs that fail the policy log the specific blocking reason (which files, which rule, which labels).
- R22. The policy is loaded from the `auto_merge` block in settings (not WORKFLOW.md).

**PR Lifecycle Monitoring (#307)**
- R23. A `PrMonitorService` background service polls all open PRs every 60 seconds (configurable via settings).
- R24. When a PR transitions to merged or closed, the state change is persisted and an SSE event is emitted.
- R25. On PR merge, if configured, the associated attempt is archived and the Linear issue transitions to the terminal state.
- R26. Workspace cleanup is triggered after PR merge when auto-archive is enabled.
- R27. Environmental errors (no `gh` CLI, no auth, no git repo) are logged as warnings, not fatal errors.
- R28. A new `/api/v1/prs` endpoint returns PR status overview for all tracked PRs.

**Attempt Checkpoint History (#375)**
- R29. An `attempt_checkpoints` table is added with per-attempt ascending ordinals and a nullable event cursor (high-water mark into `attempt_events`).
- R30. Checkpoints are written at: attempt creation, turn/thread cursor advancement, status/error/stop-signal transitions, and terminal completion (including archive-on-merge from #307).
- R31. Duplicate/no-op checkpoint writes are suppressed — if the durable cursor didn't change, no new row is written.
- R32. `GET /api/v1/attempts/:attempt_id/checkpoints` returns the ordered checkpoint history (oldest → newest), 404 for unknown attempts.
- R33. Existing attempt detail routes remain backward-compatible — checkpoint history is only behind the dedicated route.

## Success Criteria
- All 6 features implemented with Vitest test coverage for happy path and key error paths.
- No regressions in existing test suite (272+ test files).
- Playwright smoke tests pass.
- Linear issues receive accurate completion/failure comments in staging test.
- Auto-merge policy correctly gates PRs — blocked PRs log their reason, passing PRs get auto-merge requested.
- PR monitor detects merge/close within two poll cycles in integration test.
- Checkpoint history accurately reflects attempt lifecycle for a sampled run.

## Scope Boundaries
- No WORKFLOW.md config surface — all operator settings live in the existing settings config.
- No rewind/fork/resume-from-checkpoint logic — #375 lands the substrate only (append + list + GET endpoint).
- No webhook-based PR monitoring — polling only in this bundle; webhook support is a future enhancement.
- No adaptive polling interval — 60 seconds with operator override, not load-adaptive.
- No dashboard UI changes — all 6 features are backend/orchestrator. Existing dashboard surfaces are unaffected except for SSE events already exposed.
- #333 does not add a new "awaiting-review" state to the state machine unless #344 (reaction engine) ships first — the feature works by detecting feedback at retry time, not by pausing the state machine.

## Key Decisions
- **Settings, not WORKFLOW.md**: All new config (auto-merge policy, retry-on-review-feedback, archive-on-merge) lives in the existing settings config. WORKFLOW.md is not used.
- **Both success and failure comments (#275)**: Failure comments close the loop in Linear — operators don't need to check the dashboard to know an issue is stuck.
- **Auto-retry off by default (#333)**: Autonomous re-runs can create review loops. Operators opt in explicitly.
- **CI checks required for auto-merge (#258)**: Trust the GitHub status check gate, not just the agent's pre-push validation.
- **#375 fully in scope**: Full checkpoint table + write points + GET endpoint in this bundle. Rewind/fork deferred.

## Dependencies / Assumptions
- #307 must ship before or alongside #258 — auto-merge policy depends on knowing PR state.
- #307 must ship before or alongside #333 — feedback ingestion depends on knowing which PRs are open.
- `src/git/github-pr-client.ts` already exists and will be extended (not replaced).
- `src/tracker/port.ts` has or will have `createComment()` and `updateIssueState()` in its interface.
- The GitHub token in use has `pull_requests: write` and `statuses: read` scopes for auto-merge + monitoring.

## Outstanding Questions

### Resolve Before Planning
_(none — all product-level decisions resolved in brainstorm)_

### Deferred to Planning
- [Affects R1, R2][Technical] Verify exact fields available in `CompletionResult` / worker outcome — confirm `turnsCompleted`, `durationMs`, `usage.totalTokens`, `usage.inputTokens`, `usage.outputTokens`, `usage.costUsd` are present or need to be added.
- [Affects R17–R21][Technical] Confirm whether GitHub's auto-merge GraphQL mutation (`enablePullRequestAutoMerge`) is available for the target repo's GitHub plan tier.
- [Affects R15][Technical] Determine the exact settings schema path for `auto_retry_on_review_feedback` and `auto_merge` blocks.
- [Affects R23][Technical] Determine where `PrMonitorService` is started — alongside orchestrator lifecycle or as a separate long-running task.
- [Affects R29–R31][Technical] Decide whether `event_cursor` is a foreign key to `attempt_events.id` or a loose numeric high-water mark.
- [Affects R6][Technical] Decide whether summary generation uses the same Codex/Claude call as the main agent run or a separate lightweight invocation.
