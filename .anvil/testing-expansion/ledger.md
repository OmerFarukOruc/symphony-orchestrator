## Debate Ledger
**Plan**: feat: Testing expansion -- integration, full-stack E2E, visual, mutation
**Round**: 4 (FINALIZED)

### FINALIZED
All 18 settled items and 1 open item applied to plan.md on 2026-04-01 by claude-opus-4.6.
See `reviews/004-finalize-claude-2026-04-01.md` for the full changelog.

### Settled (all models agree — applied)
- [C1] Webhook signing: wording tightened to "sign the exact serialized request body bytes" -- settled round 3, applied round 4
- [C2] API denominator: 20 paths / 23 operations in spec, 55 runtime combos; "27 API endpoints" replaced throughout -- settled round 2, applied round 4
- [C3] Plan path `src/github/github-pr-client.ts` corrected to `src/git/github-pr-client.ts` -- settled round 3, applied round 4
- [C4] `src/setup/validate.ts` removed, replaced with `setup/setup-status.ts` and `setup/detect-default-branch.ts` -- settled round 2, applied round 4
- [C5] Event bus channel count corrected from 12 to 13 -- settled round 2, applied round 4
- [C6] Harness two-tier design added: Tier 1 thin stubs, Tier 2 opt-in webhook/event-bus/SQLite layers -- settled round 3, applied round 4
- [C7] SSE reconnect uses fresh dynamic port on restart (`server.start(0)`) to avoid EADDRINUSE -- settled round 2, applied round 4
- [C8] CI uses `.github/workflows/ci.yml` schedule trigger, no separate `nightly.yml` -- settled round 2, applied round 4
- [C9] Separate `playwright.fullstack.config.ts` to avoid top-level webServer conflict; `pnpm run build` in global setup -- settled round 3, applied round 4
- [C13] Script paths use glob patterns instead of hardcoded file lists -- settled round 2, applied round 4
- [C14] `test:integration` already exists; clarified rollup and live test exclusion -- settled round 3, applied round 4
- [C15] Contract tests scope clarified: spec-covered surface only; runtime-only routes documented as out of scope -- settled round 2, applied round 4
- [C17] Landing strategy added: minimum two-PR split (Units 1-4 foundation, Units 5-14 dependent) -- settled round 3, applied round 4
- [C18] `openDatabase()` is bootstrap, not migration; test scenarios reframed to bootstrap idempotence -- settled round 2, applied round 4
- [N1] Merged with C9: separate Playwright config for fullstack -- settled round 3, applied round 4
- [N2] AJV added as pre-execution gate (`pnpm add -D ajv`) in Unit 5 -- settled round 3, applied round 4
- [N3] Server restart reconnect moved to Unit 6 (Vitest); fullstack spec uses middleware simulation -- settled round 3, applied round 4
- [N4] Unit 1 sync test: added note clarifying it validates consistency, not completeness -- settled round 3, applied round 4
- [A2] Live test files placed in `tests/integration/live/` and excluded from default `test:integration` lane -- raised round 3, applied round 4

### Contested (models disagree)
*(none)*

### Open (raised, not yet addressed by all)
*(none)*

### Score History
| Round | Version | Model | Overall | UX & Design | A11y & Responsive | Verdict |
|-------|---------|-------|---------|-------------|-------------------|---------|
| 1 | v1 | claude-opus-4-6 | 7/10 | N/A | N/A | CONDITIONAL GO 82% |
| 2 | v1 | codex-gpt5.4 | 6/10 | N/A | N/A | CONDITIONAL GO 84% |
| 3 | v1 | claude-opus-4-6 | 7/10 | N/A | N/A | CONDITIONAL GO 88% |
| 4 | v2 (finalized) | claude-opus-4.6 | 8/10 | N/A | N/A | GO 92% |
