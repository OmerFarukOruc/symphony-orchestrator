---
plan: "feat: CI/CD & release pipeline with unified testing expansion"
round: 1
mode: review
model: claude-opus-4.6
date: 2026-04-02
previous: null
verdict: CONDITIONAL GO
confidence: 82%
overall_score: 7/10
---

## What Works

The plan is genuinely well-researched. Every major file path, function signature, and CI job structure has been verified against the actual codebase -- the `docker-compose.yml` using `build: .` not `image:`, the `restore-build` composite action's SHA-based cache key creating a miss on release tag checkout, the 13 SSE event channels, the 42-file Stryker mutate array, the absence of `setupFiles` in vitest configs. The docker-push rebuild decision is the right call: 2 minutes of reliability beats a fragile cross-SHA cache hack. The `[skip ci]` loop prevention is well-documented with belt-and-suspenders (`@semantic-release/git` message template + explicit `if` condition on the release job).

## Settled Points (0 items -- Round 1)

N/A -- first review.

## Issues Found

### CRITICAL: VDS rollback `docker inspect` command will fail on `build:` services

**Severity**: Critical
**Unit**: 20 (VDS Deploy Job)

The rollback script saves the previous image via:
```
docker inspect --format='{{.Config.Image}}' $(docker compose ps -q risoluto) > /opt/risoluto/.previous-image
```

The plan correctly identifies that the VDS `docker-compose.yml` needs a one-time edit to change `build: .` to `image: ${RISOLUTO_IMAGE:-...}`. But the deploy script *also* needs to handle the **first deploy** -- before the one-time edit is done (or if the `.previous-image` file doesn't exist yet). On first deploy, there is no previous image to roll back to.

Additionally, `docker inspect --format='{{.Config.Image}}'` returns the **image name** from the container's config, but for locally-built images (before the migration), this may return an empty string or a local build hash, not a pullable GHCR tag. The script should verify the `.previous-image` content is a valid GHCR reference before trusting it for rollback.

**Recommended fix**: Add a guard: if `.previous-image` doesn't exist or contains a non-GHCR reference, skip rollback and alert (deploy is one-way on first run). Document this in the operator guide.

### HIGH: Quarantine healing nightly commit creates a race with release commits

**Severity**: High
**Unit**: 24

The quarantine healing step commits and pushes changes to `quarantine.json` on the nightly run using `RELEASE_TOKEN`. But this creates a race: if a developer merges to main around 02:00 UTC (the nightly cron), the healing commit could conflict with the merge commit. Worse, the healing commit is pushed directly to `main` -- if branch protection requires status checks or PR reviews, this push will be rejected entirely.

The plan identifies "unlikely to conflict" but doesn't address the branch protection bypass. The `RELEASE_TOKEN` PAT with admin bypass (required for semantic-release) would also bypass branch protection for quarantine healing commits. This is a broader permissions concern -- a PAT that can bypass branch protection for version bumps also means *any* workflow using that PAT can push directly to main.

**Recommended fix**: Either (1) have the healing script open a PR instead of pushing directly, or (2) create a separate PAT with only `contents:write` (no admin bypass) for quarantine healing, accepting that it only works if branch protection allows GitHub Actions pushes.

### HIGH: Quarantine `qtest` wrapper approach has significant adoption friction

**Severity**: High
**Unit**: 23

The plan proposes exporting a `qtest` function from the setup file. Every test that *might* be quarantined must import `qtest` instead of `test` from vitest. This creates two problems:

1. **Adoption burden**: Existing tests (244 files) all import `test` from vitest. To quarantine any test, someone must first refactor its imports. This defeats the purpose of a quick quarantine mechanism.
2. **Incomplete coverage**: New tests written without `qtest` can never be quarantined without a code change.

The plan mentions an alternative approach (setup file with `beforeEach` + `context.skip()`) and dismisses it as unreliable. But Vitest `onTestFinished`/`beforeEach` with `ctx.skip()` does work in Vitest 2+. The more robust approach is to use Vitest's `test.extend()` in the setup file to create a custom test fixture that reads the quarantine list and calls `skip()` -- this requires zero changes to existing test files.

**Recommended fix**: Use a Vitest setup file that hooks into the test lifecycle via `beforeEach` with `ctx.skip()`, or use a `globalSetup` that monkey-patches the global `test`/`it` to check quarantine status. This eliminates the import-change requirement.

### HIGH: `integration-pr` job exposes `LINEAR_API_KEY` secret to PR builds from forks

**Severity**: High
**Unit**: 25

The plan adds an `integration-pr` job that runs `pnpm run test:integration` on every PR. The current `integration` job is main-only specifically because it uses `LINEAR_API_KEY`. Looking at `vitest.integration.config.ts`, it includes all `*.integration.test.ts` files. If any integration test (current or future) accesses `LINEAR_API_KEY` from `process.env`, this secret would be exposed to fork PRs.

The existing `integration` job (main-only, line 252 of `ci.yml`) has `env: LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}`. The plan for `integration-pr` says "no `if` filter" and "uses `restore-build`" but doesn't specify whether `LINEAR_API_KEY` is injected. If it is, this is a security issue for public repos. If it isn't, integration tests that depend on it will fail on every PR.

**Recommended fix**: The `integration-pr` job must NOT inject `LINEAR_API_KEY`. Integration tests must be written to gracefully skip (not fail) when credentials are absent. The testing expansion plan mentions "credential-gated" for live tests but doesn't enforce this pattern for all integration tests. Add an explicit requirement that all non-live integration tests must work without credentials.

### MEDIUM: `ci.yml` will exceed 700+ lines with no extraction plan

**Severity**: Medium
**Units**: 18, 19, 20, 21, 22, 24, 25

The current `ci.yml` is 440 lines. The plan adds 8+ new jobs: `release`, updated `docker-push`, `deploy-vds`, `fullstack-e2e`, `visual-regression`, `live-provider-smoke`, `mutation-full` (rename), `nightly-notify`, `quarantine-heal`, `integration-pr`, `mutation-incremental`. Each job is ~20-40 lines. The file will exceed 800 lines.

The plan says "defer `nightly.yml` extraction unless ci.yml exceeds ~800 lines" but the math clearly shows it will. This deferral is not a deferral -- it's a Unit 25 addition that should be planned now. An 800+ line workflow file is hard to review, debug, and maintain.

**Recommended fix**: Add a decision point after Unit 22: if `ci.yml` exceeds ~700 lines, extract nightly jobs into `nightly.yml` before Unit 25. The extraction is straightforward (copy nightly-gated jobs + shared `build` job to a new file).

### MEDIUM: Commitlint `.ts` config requires `tsx` as a runtime dependency

**Severity**: Medium
**Unit**: 15

The plan says "commitlint CLI supports `.ts` configs natively via `tsx`." This is partially true -- `@commitlint/cli` uses `jiti` or `tsx` under the hood for TS config loading, but only if `tsx` is available. The repo has `tsx` as a devDependency (used for `pnpm run dev`), so this works locally. But in CI, the `commit-msg` hook doesn't run (commits happen in GitHub Actions). The concern is: if `tsx` is ever removed or the `commitlint` version changes its TS config loader, the hook breaks silently.

**Recommended fix**: Minor -- just note the `tsx` dependency explicitly, or use a `.mjs` config file instead to eliminate the runtime dependency.

### MEDIUM: `RELEASE_TOKEN` PAT scope is under-specified

**Severity**: Medium
**Unit**: 18

The plan says `RELEASE_TOKEN` needs `contents:write`, `packages:write`, and "admin bypass." The exact GitHub PAT permissions needed are:

- For semantic-release: `contents: write` (push tags, create releases), `issues: write` + `pull-requests: write` (comment on issues/PRs)
- For branch protection bypass: must be a *fine-grained PAT* with "Allow specified actors to bypass required pull requests" or a *classic PAT* with admin scope
- For quarantine healing (Unit 24): same PAT is reused

The plan doesn't distinguish between fine-grained vs classic PATs. Fine-grained PATs with repository-scoped permissions are the secure choice but have different configuration UX. Classic PATs with `repo` scope work but are overly broad.

**Recommended fix**: Specify fine-grained PAT with exact repository-scoped permissions. Add the configuration steps to `docs/OPERATOR_GUIDE.md` during Unit 25.

### MEDIUM: Nightly `fullstack-e2e` job uses `restore-build` but schedule runs use HEAD of main

**Severity**: Medium
**Unit**: 21

The plan states: "Each nightly job uses `restore-build` composite action (same SHA as the schedule trigger -- schedule runs use HEAD of default branch, so SHA matches)." This is correct *if* no commit has been pushed between the `build` job finishing and the nightly job restoring the cache. GitHub Actions schedule triggers use the HEAD SHA at trigger time, and all jobs in the same run share that SHA. However, the `build` job saves cache with key `build-${{ github.sha }}`. If the build job is skipped on schedule events (it currently has no schedule guard), this works. If GitHub evicts the cache between the last push and the nightly run, the `restore-build` will silently fail (cache miss is not an error).

Looking at the CI workflow: the `build` job has no `if` condition, so it runs on schedule events. Good -- it will create the cache. But GitHub Actions caches expire after 7 days of non-access. If no push happens for 7 days (unlikely but possible), the nightly cache key from the last push's SHA won't match the schedule run's SHA (which is HEAD of main, same as last push). Wait -- actually, schedule runs resolve `github.sha` to HEAD of main, which *is* the same SHA as the last push to main. So this is fine. No issue here, retracting.

### MEDIUM: Deploy health check uses `/api/v1/runtime` but healthcheck uses `/api/v1/state`

**Severity**: Medium
**Unit**: 20

The deploy job health checks against `curl -sf http://localhost:4000/api/v1/runtime`, while the existing `docker-compose.yml` healthcheck uses `fetch('http://127.0.0.1:4000/api/v1/state')`. These are different endpoints returning different data. If `/api/v1/runtime` returns 200 but `/api/v1/state` requires an initialized orchestrator (which might not be ready yet), the deploy health check could pass while the container's own healthcheck is still failing.

Looking at the actual route handler: `/api/v1/runtime` returns static metadata (version, data_dir, feature_flags, provider_summary) that doesn't depend on orchestrator state. `/api/v1/state` returns `orchestrator.getSerializedState()` which requires the orchestrator to be initialized. The plan chose `/api/v1/runtime` intentionally -- it's the "is the process alive" check vs "is the system ready" check.

This is defensible but should be documented. The operator should know that a successful deploy health check means the process started, not that it's fully initialized and polling.

**Recommended fix**: Document the distinction in the operator guide. Optionally, add a second health check against `/api/v1/state` with a longer timeout.

### LOW: Stryker `mutate` array count claim "42" is correct but the expansion to "~65" lacks a target list

**Severity**: Low
**Unit**: 12

The plan says expand from 42 to ~65 files but defers the actual file list to implementation. This is fine for a plan, but the executor has no guidance on *which* files to add. The plan should at minimum list the directories/modules to expand into (e.g., `src/http/`, `src/persistence/`, `src/setup/`).

**Recommended fix**: Add a brief note listing the primary directories for expansion candidates.

### LOW: `semantic-release` `@semantic-release/npm` with `npmPublish: false` still modifies `package.json`

**Severity**: Low
**Unit**: 17

This is correctly handled in the plan (noted that npm plugin updates version even with `npmPublish: false`). However, the plan doesn't mention that `semantic-release` will also update `package-lock.json` if it exists. This repo uses pnpm, so `pnpm-lock.yaml` is the lockfile. The `@semantic-release/git` `assets` array only lists `["package.json", "CHANGELOG.md"]` -- it should also include `pnpm-lock.yaml` if the version bump changes it. Actually, `pnpm` doesn't store the version in the lockfile the same way npm does, so this may be a non-issue. But verify during implementation.

**Recommended fix**: Verify whether `pnpm-lock.yaml` changes when `package.json` version is bumped. If so, add it to the assets array.

### LOW: SonarCloud reference cleanup scope is wider than the plan suggests

**Severity**: Low
**Unit**: 25

The plan says "Search all `docs/*.md` for SonarCloud references." I checked: operator-facing docs (`OPERATOR_GUIDE.md`, `ROADMAP_AND_STATUS.md`, `CONFORMANCE_AUDIT.md`) have no SonarCloud references. References exist only in `docs/plans/2026-03-30-001-*.md` and `docs/brainstorms/2026-04-02-*.md` -- which are historical documents that arguably should *not* be edited (they reflect what was true at the time). The plan's R21 is effectively already satisfied for operator-facing docs.

**Recommended fix**: Clarify that R21 targets operator-facing docs only, not historical plan/brainstorm archives.

## Scores

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Completeness | 8 | Thoroughly researched, all file paths verified, most edge cases addressed. Gaps in quarantine adoption strategy and first-deploy handling. |
| Sequencing & Dependencies | 8 | Phase ordering is correct and well-justified. Dependencies between testing expansion and CI/CD layers are explicit. The Mermaid diagram matches the prose. |
| Risk Coverage | 6 | Risk table covers the obvious failures but misses the branch protection conflict for quarantine healing, the fork PR secret exposure, and the first-deploy rollback gap. No rollback plan for commitlint if it blocks a critical hotfix beyond SKIP_HOOKS. |
| Feasibility | 8 | All proposed tools exist, the architecture is proven, and the incremental delivery strategy is sound. The 25-unit scope is large but each unit is small and testable. |
| Edge Cases | 6 | First deploy without previous image, quarantine healing race, `qtest` adoption friction, credential exposure on fork PRs, ci.yml size explosion -- all missed or under-addressed. |
| UX & Design Quality | N/A | Non-UI plan |
| Accessibility & Responsiveness | N/A | Non-UI plan |
| Clarity | 8 | Very clear writing. Requirements trace is excellent. Each unit has approach, patterns, test scenarios, and verification. The testing expansion by-reference strategy works well. |
| Scope Discipline | 7 | 25 units is ambitious but each is justified by a requirement. The quarantine weekly audit (Linear issue creation) is scope creep -- it's a nice-to-have that adds API integration complexity for marginal value. |
| ROI / Effort | 7 | The testing expansion (14 units) and release pipeline (4 units) are high-ROI. The quarantine system (2 units) is over-engineered for a solo-maintainer project -- a simple "skip this test" comment would suffice until flaky tests become a real problem. |
| Goal Alignment | 8 | Every unit traces back to a requirement. The nightly pipeline, release automation, and PR integration tests directly address the three stated capability gaps. |

**Overall: 7/10**

The plan is technically excellent in its codebase research and architecture decisions. The primary drags are: (1) risk coverage misses on security (fork PR secret exposure) and operations (first-deploy rollback, branch protection for healing commits), (2) the quarantine system is over-engineered for the project's scale, and (3) the `qtest` adoption friction undermines the quarantine's utility.

## Verdict

**CONDITIONAL GO -- 82%**

Conditions for execution:

1. **Must fix**: Resolve the `integration-pr` credential exposure -- integration tests must work without `LINEAR_API_KEY` in PR builds. This is a security gate.
2. **Must fix**: Add first-deploy guard to the VDS rollback script -- handle the case where `.previous-image` doesn't exist.
3. **Should fix**: Replace `qtest` wrapper with a zero-import-change quarantine mechanism (Vitest `beforeEach` + `ctx.skip()` or monkey-patch approach).
4. **Should fix**: Address the quarantine healing branch protection conflict -- PR-based approach or separate PAT.
5. **Decide now**: Will `nightly.yml` extraction happen at Unit 22 or be deferred? The ci.yml will exceed 800 lines.

The plan is executable with these conditions addressed. The underlying architecture decisions (docker-push rebuild, [skip ci], dynamic ports, separate Playwright config) are all sound.

## Debate Ledger

**Plan**: feat: CI/CD & release pipeline with unified testing expansion
**Round**: 1

### Settled (all models agree)
(none yet -- Round 1)

### Contested (models disagree)
(none yet -- Round 1)

### Open (raised, not yet addressed by all)
- VDS first-deploy rollback gap: raised by claude-opus-4.6 round 1
- Quarantine healing branch protection race: raised by claude-opus-4.6 round 1
- `qtest` adoption friction: raised by claude-opus-4.6 round 1
- `integration-pr` credential exposure on fork PRs: raised by claude-opus-4.6 round 1
- `ci.yml` size explosion past 800 lines: raised by claude-opus-4.6 round 1
- Commitlint `.ts` config `tsx` dependency: raised by claude-opus-4.6 round 1
- `RELEASE_TOKEN` PAT scope under-specified: raised by claude-opus-4.6 round 1
- Deploy health check endpoint mismatch: raised by claude-opus-4.6 round 1
- Stryker expansion target list missing: raised by claude-opus-4.6 round 1
- SonarCloud cleanup scope: raised by claude-opus-4.6 round 1
- `pnpm-lock.yaml` in semantic-release assets: raised by claude-opus-4.6 round 1
- Quarantine system over-engineering: raised by claude-opus-4.6 round 1

### Score History
| Round | Version | Model | Overall | UX & Design | A11y & Responsive | Verdict |
|-------|---------|-------|---------|-----------|--------------------|---------|
| 1 | v1 | claude-opus-4.6 | 7/10 | N/A | N/A | CONDITIONAL GO 82% |
