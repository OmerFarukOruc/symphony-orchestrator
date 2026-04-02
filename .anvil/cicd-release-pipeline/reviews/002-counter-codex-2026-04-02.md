---
plan: "feat: CI/CD & release pipeline with unified testing expansion"
round: 2
mode: counter-review
model: codex-gpt5.4
date: 2026-04-02
previous: reviews/001-review-claude-2026-04-02.md
verdict: CONDITIONAL GO
confidence: 74%
overall_score: 6/10
---

## What Works

The plan is grounded in the real repo rather than wishful architecture. The strongest parts still hold: the SHA-bound cache miss on release-tag checkout is real (`.github/actions/restore-build/action.yml`, `.github/workflows/ci.yml`), so rebuilding in `docker-push` is the right choice; the VDS deploy design correctly notices the current host compose file is `build:`-based (`docker-compose.yml:2-3`); and the plan preserves important current invariants such as PR-vs-push `paths-ignore` asymmetry and the unchanged `knip` / `dependency-review` jobs (`.github/workflows/ci.yml:3-12`, `.anvil/cicd-release-pipeline/plan.md:817`).

The by-reference merge with the testing expansion plan is also directionally sound. The repo already has the nightly schedule lane, current mutation job, integration lane, Playwright smoke split, and live-vs-nonlive testing concepts in place (`.github/workflows/ci.yml:10-12`, `.github/workflows/ci.yml:252-301`, `package.json:25-35`, `vitest.integration.config.ts:42-46`), so this is a plausible extension rather than a greenfield reinvention.

## Settled Points

- `AGREE` — VDS first-deploy rollback gap. Unit 20 saves `.previous-image` and rolls back unconditionally (`.anvil/cicd-release-pipeline/plan.md:591-595`), but the current deploy target still uses `build: .` with no pullable image reference (`docker-compose.yml:2-3`). First deploy and non-GHCR prior containers need an explicit no-rollback guard.
- `AGREE` — `qtest` adoption friction is real. The plan requires tests to opt into `qtest` imports (`.anvil/cicd-release-pipeline/plan.md:704-711`), but the current repo has no `setupFiles` at all in either Vitest config (`vitest.config.ts:3-38`, `vitest.integration.config.ts:42-46`) and `232` test files currently import from `vitest`. That makes the quarantine mechanism partial by default, which undershoots R17.
- `AGREE` — `RELEASE_TOKEN` scope is under-specified. The plan says PAT plus admin bypass (`.anvil/cicd-release-pipeline/plan.md:515-519`) and later reuses that token for quarantine healing pushes (`.anvil/cicd-release-pipeline/plan.md:758-762`), but it never locks down minimum permissions or token separation.
- `AGREE` — SonarCloud cleanup scope is too broad as written. A repo search shows the remaining Sonar references are in historical plans/brainstorms and this debate thread, not in the live operator docs or workflow. R21 should target current operator-facing docs, not all archival `docs/*.md`.

## Contested Points

- `PARTIALLY AGREE` — Quarantine healing branch-protection race. Claude is right that direct nightly pushes to `main` via `RELEASE_TOKEN` broaden risk (`.anvil/cicd-release-pipeline/plan.md:758-762`). I do not think the “race” framing is the main problem, because the actual codebase gives us no branch-protection config to prove a conflict path. The stronger objection is permissions coupling: release automation and quarantine healing should not share the same privileged write token.
- `PARTIALLY AGREE` — `integration-pr` credential exposure on fork PRs. The codebase evidence is that the current main-only integration lane injects `LINEAR_API_KEY` (`.github/workflows/ci.yml:252-265`) while `vitest.integration.config.ts` includes the entire integration suite (`vitest.integration.config.ts:42-46`). The plan’s PR job reuses that same suite on every PR with no partitioning (`.anvil/cicd-release-pipeline/plan.md:797-802`). That is a real boundary gap. But “secret exposure to fork PRs” is overstated: GitHub does not pass repository secrets to fork-triggered `pull_request` workflows by default. The actual problem is that the plan never makes the PR integration lane explicitly credentialless.
- `PARTIALLY AGREE` — `ci.yml` size explosion. The current file is already `440` lines, so the maintainability concern is real. I do not buy this as a blocking plan flaw by itself. Extraction should be a threshold-based decision during implementation, not a prerequisite amendment before execution.
- `DISAGREE` — Commitlint `.ts` config as a substantive risk. The repo already depends on `tsx` (`package.json`) and already uses TypeScript config files (`vitest.config.ts`, `vitest.integration.config.ts`). This is a hypothetical future-maintenance concern, not a current plan defect.
- `PARTIALLY AGREE` — Deploy health check endpoint mismatch. The mismatch exists: container health uses `/api/v1/state` (`docker-compose.yml:31-38`) while the deploy plan uses `/api/v1/runtime` (`.anvil/cicd-release-pipeline/plan.md:594`). But `src/http/routes.ts` makes clear these endpoints have different semantics: `/runtime` is a fast liveness check and `/state` is orchestrator-backed readiness (`src/http/routes.ts:88-105`). That needs documentation or a two-stage health check, not necessarily a redesign.
- `DISAGREE` — Missing Stryker target list as a meaningful plan blocker. Unit 12 is inherited from the finalized testing-expansion plan and the current `stryker.config.json` already gives the concrete 42-file baseline. This is implementation detail, not a cross-model review blocker.
- `DISAGREE` — `pnpm-lock.yaml` should be added to semantic-release assets. The current repo search shows the project version only in `package.json`, not in `pnpm-lock.yaml`, so there is no codebase evidence that a version bump would require lockfile commit tracking here.
- `DISAGREE` — The quarantine system is over-engineering in principle. The scope may be a little ambitious, especially the weekly Linear audit, but R16-R19 explicitly require quarantine + healing + cap behavior. The right criticism is that the design is underspecified and partially mis-sequenced, not that the whole capability should be cut.

## Open Points

- The release pipeline still needs a concrete job-output design before execution. Right now `docker-push` depends on `needs.release.outputs.new_release_published` / `new_release_version`, but Unit 18 never explains how those outputs are produced.
- The PR integration lane needs an explicit credential boundary. “Run `pnpm run test:integration` on all PRs” is not enough while the current main-only lane is secret-backed.
- The quarantine design still needs one repo-wide mechanism that actually applies to all Vitest files without per-test-file import churn.
- The permissions model still needs separation between release writes and quarantine-healing writes.
- The deploy docs should explicitly distinguish liveness (`/runtime`) from readiness (`/state`) if the plan keeps both checks.

## Additional Issues Found

- `NEW` — Release job outputs are unspecified. Unit 18 promises `new_release_published` and `new_release_version` outputs (`.anvil/cicd-release-pipeline/plan.md:517`), and Unit 19 consumes them (`.anvil/cicd-release-pipeline/plan.md:545-557`), but there is no step/output mapping design anywhere in the plan. As written, downstream release-tag checkout cannot work.
- `NEW` — The release checkout recipe is incomplete for `semantic-release`. The current workflow uses plain `actions/checkout@v6` defaults (`.github/workflows/ci.yml:35`, `.github/workflows/ci.yml:240`, `.github/workflows/ci.yml:314`), and the plan says to pattern-match existing main-only jobs plus `restore-build` (`.anvil/cicd-release-pipeline/plan.md:513`, `.anvil/cicd-release-pipeline/plan.md:521-523`). That omits two important release requirements: full history/tags (`fetch-depth: 0`) and avoiding persisted default credentials when a custom release token is meant to push. This is also called out in the official semantic-release GitHub Actions recipe.
- `NEW` — `mutation-incremental` is wrong for multi-commit PRs. The current script only mutates files changed in `HEAD~1..HEAD` (`package.json:35`), and Unit 25 adopts that script directly for PR CI (`.anvil/cicd-release-pipeline/plan.md:803-809`). On a normal multi-commit PR, that misses earlier commits in the branch and under-tests the actual PR diff.
- `NEW` — Quarantine healing is underspecified for unit-test quarantine. Unit 23 wires quarantine into both `vitest.config.ts` and `vitest.integration.config.ts` (`.anvil/cicd-release-pipeline/plan.md:695-719`), but Unit 21’s nightly Vitest lane is only `live-provider-smoke` (`.anvil/cicd-release-pipeline/plan.md:632`). There is no nightly `pnpm test` lane with `QUARANTINE_ENFORCE=false`, so quarantined unit tests would never accumulate healing passes. Unit 24 also says the healer parses Vitest JSON (`.anvil/cicd-release-pipeline/plan.md:751-752`) without specifying any JSON reporter/output step.
- `NEW` — Unit 21/22 contain a job-name inconsistency. Unit 21 says the existing `mutation` job is renamed to `mutation-full` (`.anvil/cicd-release-pipeline/plan.md:634`), but Unit 22 still declares `needs: [fullstack-e2e, visual-regression, live-provider-smoke, mutation]` and checks `needs.mutation.result` (`.anvil/cicd-release-pipeline/plan.md:664-665`). That is a concrete plan inconsistency, not just editorial noise.
- `NEW` — Main-branch release gating vs secret-backed integration is unresolved. The current secret-backed `integration` job is main-only and not part of `build-and-test` (`.github/workflows/ci.yml:252-265`, `.github/workflows/ci.yml:394-431`). Unit 25 adds `integration-pr` to the gate, but says nothing about whether the existing main-only integration lane is retained, removed, or made a release precondition. As written, release/deploy could still proceed independently of the secret-backed integration lane.

## Revised Scores

Frontend & UX: N/A

| Dimension | Round 1 (Claude) | Round 2 (Codex) | Delta |
|-----------|------------------|-----------------|-------|
| Completeness | 8 | 6 | -2 |
| Sequencing | 8 | 7 | -1 |
| Risk Coverage | 6 | 5 | -1 |
| Feasibility | 8 | 6 | -2 |
| Edge Cases | 6 | 5 | -1 |
| Clarity | 8 | 8 | 0 |
| Scope Discipline | 7 | 7 | 0 |
| ROI / Effort | 7 | 6 | -1 |
| Goal Alignment | 8 | 8 | 0 |
| **Overall** | **7** | **6** | **-1** |

The score drops mostly because Round 1 missed several execution-critical workflow gaps, not because the plan’s core direction is wrong. My current bar is still `CONDITIONAL GO`, but only after the release job contract, mutation diff basis, and quarantine-healing design are tightened.
