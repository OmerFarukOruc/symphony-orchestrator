---
plan: "feat: CI/CD & release pipeline with unified testing expansion"
round: 4
mode: finalize
model: claude-opus-4.6
date: 2026-04-02
previous: reviews/003-counter-claude-2026-04-02.md
verdict: GO
confidence: 88%
overall_score: 8/10
settlements_applied: 18
---

# Finalize Changelog

## Summary

Merged 18 review settlements from 3 adversarial rounds (claude-opus-4.6 Round 1, codex-gpt5.4 Round 2, claude-opus-4.6 Round 3) into the final executable plan. All contested and open points converged to settled. No items remain contested or open.

## Anti-Compromise Check

All 18 settlements were checked against the anti-compromise criteria:

1. **Hedge test**: No settlement uses unqualified "consider", "optionally", or "as needed". The quarantine proportionality note says "may be deferred" but specifies the condition (if implementation effort exceeds estimates) and the scope boundary (R18-R19 specifically).
2. **Division test**: No settlement introduces artificial case splits. The liveness/readiness distinction in Settlement 9 is a genuine architectural difference already present in the codebase, not debate-created.
3. **Diplomat test**: Settlements produce clear winners: `ctx.skip()` over `qtest` wrapper (Settlement 2), `jiti` is the mechanism not `tsx` (Settlement 8), `QUARANTINE_TOKEN` separate from `RELEASE_TOKEN` (Settlement 5), `origin/main...HEAD` over `HEAD~1..HEAD` in CI (Settlement 15).
4. **Specificity test**: All settlements are more specific than the original plan text. Unit 18 now has concrete YAML for step/output wiring; Unit 20 has a full bash script for first-deploy guard; Unit 25 has explicit credentialless boundary language.

No settlements failed the anti-compromise check.

## Settlements Applied (18/18)

### From Round 1-2 (4 settlements)

| # | Settlement | Where Applied | Change Type |
|---|-----------|---------------|-------------|
| 1 | VDS first-deploy rollback gap | Unit 20 approach, deploy script | Added first-deploy guard: verify container exists, verify GHCR reference, skip rollback on first deploy |
| 2 | `qtest` wrapper replaced with `beforeEach` + `ctx.skip()` | Unit 23 approach, Key Technical Decisions, Open Questions, External References | Replaced entire quarantine mechanism from wrapper-function to zero-import `beforeEach` hook |
| 3 | `RELEASE_TOKEN` PAT scope specified | Unit 18 approach, Documentation section | Added fine-grained PAT with exact repository-scoped permissions |
| 4 | SonarCloud cleanup scope narrowed | Unit 25 approach | Scoped to operator-facing docs only, excluding historical archives |

### From Round 2-3 (8 contested -> settled)

| # | Settlement | Where Applied | Change Type |
|---|-----------|---------------|-------------|
| 5 | Quarantine healing permissions coupling | Unit 24 CI integration, Risks table, Documentation section | Separated `QUARANTINE_TOKEN` from `RELEASE_TOKEN`; added fallback to PR-based approach |
| 6 | `integration-pr` credentialless boundary | Unit 25 `integration-pr` job | Added explicit no-credentials requirement and graceful-skip mandate |
| 7 | `ci.yml` size threshold | Unit 25 new paragraph | Added threshold-based file size gate (800 lines -> extract nightly.yml) |
| 8 | Commitlint `.ts` config uses `jiti` | Unit 15 approach | Corrected mechanism from `tsx` to `jiti` with explanation |
| 9 | Deploy health check liveness vs readiness | Unit 20 patterns section | Documented intentional distinction; added operator guide reference |
| 10 | Stryker target list in referenced plan | No change needed | Confirmed by-reference structure is correct; target list exists in testing expansion plan Unit 12 |
| 11 | `pnpm-lock.yaml` not in assets | No change needed | Confirmed lockfile does not contain project version; assets array correct as-is |
| 12 | Quarantine proportionality note | Phase J header | Added proportionality note about R18-R19 deferral option |

### From Round 2 open -> settled (6 items, includes 4 must-fixes)

| # | Settlement | Where Applied | Change Type | Must-Fix? |
|---|-----------|---------------|-------------|-----------|
| 13 | Release job outputs wired | Unit 18 approach | Added full YAML for `id: release`, output mapping, and `GITHUB_OUTPUT` export step | Yes |
| 14 | Release job `fetch-depth: 0` + credentials | Unit 18 new "Checkout requirements" section | Added `fetch-depth: 0`, `persist-credentials: false`, PAT handling guidance | Yes |
| 15 | Mutation-incremental diff range | Unit 25 `mutation-incremental` job | Replaced `HEAD~1..HEAD` with `origin/main...HEAD` in CI; added `fetch-depth: 0`; preserved local script | Yes |
| 16 | Quarantine healing nightly step | Unit 24 CI integration | Added concrete `pnpm test` step with `QUARANTINE_ENFORCE=false` and `--reporter=json` | No (should-fix) |
| 17 | Job-name mismatch fixed | Unit 22 approach | Changed `needs.mutation` to `needs.mutation-full` in needs array and result checks | Yes |
| 18 | Integration gate design documented | Unit 25 `build-and-test` update | Added note explaining `integration` vs `integration-pr` gating relationship | No (documentation) |

## Items That Could Not Be Applied

None. All 18 settlements were applied successfully.

## Score Revision

The finalized plan scores higher than any individual review round because all identified gaps have been addressed:

| Dimension | Pre-finalize (R3) | Finalized | Delta | Rationale |
|-----------|-------------------|-----------|-------|-----------|
| Completeness | 7 | 8 | +1 | Release job outputs, checkout config, mutation diff range all specified |
| Sequencing | 8 | 8 | 0 | Already strong; no changes needed |
| Risk Coverage | 6 | 8 | +2 | First-deploy guard, credential separation, credentialless boundary all addressed |
| Feasibility | 7 | 8 | +1 | All execution gaps (step wiring, job-name mismatch) fixed |
| Edge Cases | 6 | 8 | +2 | First deploy, multi-commit PRs, non-GHCR images, credential absence all handled |
| Clarity | 8 | 9 | +1 | Concrete YAML examples, explicit bash scripts, documented rationale |
| Scope Discipline | 7 | 7 | 0 | Proportionality note adds flexibility without expanding scope |
| ROI / Effort | 7 | 7 | 0 | No change |
| Goal Alignment | 8 | 8 | 0 | No change |
| **Overall** | **7** | **8** | **+1** | All must-fix items resolved; risk coverage significantly improved |

## Final Verdict

**GO -- 88%**

The plan is ready for execution. All 18 settlements from 3 adversarial review rounds have been merged. No contested or open items remain. The 4 must-fix items (release job outputs, fetch-depth, job-name mismatch, mutation diff range) are all resolved in the finalized text.

Remaining execution-time decisions (not plan defects):
- Whether to defer R18-R19 (quarantine healing automation) -- product decision, noted in proportionality comment
- Whether to extract `nightly.yml` -- threshold-based decision at implementation time, noted in Unit 25
- Exact `QUARANTINE_TOKEN` PAT vs PR-based approach for healing commits -- depends on branch protection config
