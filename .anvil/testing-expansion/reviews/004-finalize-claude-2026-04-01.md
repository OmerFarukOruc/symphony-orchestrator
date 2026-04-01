---
plan: "feat: Testing expansion -- integration, full-stack E2E, visual, mutation"
round: 4
mode: finalize
model: claude-opus-4.6
date: 2026-04-01
previous: reviews/003-counter-claude-2026-04-01.md
verdict: GO
confidence: 92%
overall_score: 8/10
---

# Finalization Changelog

## Summary

Merged 18 settled items and 1 open item (A2) from 3 rounds of adversarial review into the plan. All amendments are concrete corrections (factual errors, missing dependencies, underspecified mechanics). No architectural changes were required.

## Amendments Applied

### From Round 1-2 Settlements

1. **[C2] API endpoint count** — Replaced all "27 endpoints" references with accurate counts: "20 paths / 23 operations" for OpenAPI spec, "55 method/path combinations" for runtime. Added scope note clarifying contract tests cover spec-covered surface only. Updated R5, SC5, Unit 5 goal and scope note.

2. **[C4] `src/setup/validate.ts` does not exist** — Removed from Unit 12 mutation target list. Replaced with `setup/setup-status.ts` (53 lines, real logic) and `setup/detect-default-branch.ts` (102 lines, real logic).

3. **[C5] Event bus has 13 channels, not 12** — Fixed count in Context & Research section and Unit 6 verification.

4. **[C7] SSE reconnect port reuse risk** — Changed all SSE reconnect server restart tests to use `server.start(0)` (fresh dynamic port) instead of reusing the captured port. Updated Key Technical Decisions, Resolved Questions, Unit 6, Unit 7 approaches. Added EADDRINUSE/TIME_WAIT to risks table.

5. **[C8] No `nightly.yml`** — Replaced all references to `.github/workflows/nightly.yml` with `.github/workflows/ci.yml` schedule trigger. Updated R30, Unit 14 files list, Unit 14 approach. Added resolved question clarifying "nightly CI" means the scheduled lane in `ci.yml`.

6. **[C13] Hardcoded integration test paths** — Changed Unit 14 script definitions from hardcoded file paths to glob patterns (`--include 'tests/integration/sqlite-*.integration.test.ts'` etc.).

7. **[C15] Contract test scope gaps** — Added scope note to plan overview, Unit 5, and System-Wide Impact clarifying which routes are spec-covered vs runtime-only. Listed uncovered route categories (setup wizard, template CRUD, audit, models, events, webhooks).

8. **[C18] Migration testing** — Reframed Unit 4 from "migration testing" to "bootstrap idempotence testing". Changed test scenarios from "incremental migration" to "bootstrap idempotence" (call openDatabase twice, schema unchanged). Added note about `migrateFromJsonl()` for data migration paths. Added Key Technical Decision entry.

### From Round 3 Settlements

9. **[C1] Webhook signing wording** — Replaced `JSON.stringify(payload)` references with "serialize the payload to a string, sign that exact string, use the same bytes as the request body". Added key invariant: "the signing input and the request body must be the same byte sequence." Updated resolved questions, Unit 7 approach.

10. **[C3] GitHub PR client path** — Fixed `src/github/github-pr-client.ts` to `src/git/github-pr-client.ts` in Unit 12 mutation targets.

11. **[C6] Harness complexity — two-tier design** — Added "Harness Tiers" section to Unit 3 with Tier 1 (thin stubs for OrchestratorPort) and Tier 2 (opt-in webhook/event-bus/SQLite layers). Enumerated which methods are stubbed vs real per tier. Referenced `makeDeps()` in `webhook-handler.test.ts` as the reference pattern. Updated Units 6 and 7 to specify which tiers they need.

12. **[C9] Fullstack Playwright config** — Created separate `playwright.fullstack.config.ts` as a new file instead of adding a project to existing config. Updated R8, Key Technical Decisions, Unit 8 files/approach. Specified `pnpm run build` (full build, not just frontend) in global setup.

13. **[C14] `test:integration` rollup** — Clarified that `test:integration` already exists in `package.json`. Added resolved question explaining how subset scripts roll up and how live tests are excluded. Updated Unit 14 vitest config changes.

14. **[C17] PR/commit boundaries** — Added "Landing Strategy" section recommending minimum two-PR split (Units 1-4 foundation, Units 5-14 dependent). Added atomic commit grouping guidance.

15. **[N1] Separate Playwright fullstack config** — Merged with C9 above. The fullstack config is a new file to avoid the unconditional top-level `webServer`.

16. **[N2] AJV dependency** — Added "Pre-execution gate: `pnpm add -D ajv`" to Unit 5.

17. **[N3] SSE reconnect lifecycle** — Moved server stop/restart reconnect testing from Unit 9 (Playwright) to Unit 6 (Vitest). Unit 9 now tests browser-side reconnect via middleware-level simulation (503 on `/api/v1/events`). Updated R11 to reflect the split.

18. **[N4] Spec sync completeness note** — Added note to Unit 1 goal: "This test validates spec consistency, NOT spec completeness."

### From Open Items

19. **[A2] Live test isolation** — Moved live test files to `tests/integration/live/` subdirectory. Added `exclude` pattern for `tests/integration/live/**` to `vitest.integration.config.ts`. Updated Unit 10 file paths and added isolation note. Updated Unit 14 to include the exclude pattern. Added verification point: "`pnpm run test:integration` does NOT attempt to load or run live test files."

## Sections Added or Restructured

- **Scope Note** (new) — Top of plan, clarifying spec-covered vs runtime-only API surface
- **Landing Strategy** (new) — Between Technical Design diagram and Implementation Units
- **Harness Tiers** (new) — Within Unit 3, describing two-tier design
- **Live test isolation** (new) — Within Unit 10 and Unit 14

## Score Delta

| Dimension | Pre-finalize | Post-finalize | Delta |
|-----------|-------------|---------------|-------|
| Completeness | 6/10 | 8/10 | +2 |
| Sequencing & Dependencies | 8/10 | 9/10 | +1 |
| Risk Coverage | 6/10 | 8/10 | +2 |
| Feasibility | 7/10 | 8/10 | +1 |
| Edge Cases | 7/10 | 8/10 | +1 |
| Clarity | 7/10 | 8/10 | +1 |
| Scope Discipline | 6/10 | 8/10 | +2 |
| ROI / Effort | 8/10 | 8/10 | 0 |
| Goal Alignment | 8/10 | 8/10 | 0 |

**Overall: 8/10** (up from 7/10)

All factual errors corrected. All underspecified mechanics now have concrete guidance. Scope is precisely defined with spec-covered vs runtime-only distinction. The plan is executable by an unfamiliar implementer.
