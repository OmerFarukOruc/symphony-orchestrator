## Debate Ledger

**Plan**: feat: CI/CD & release pipeline with unified testing expansion
**Round**: 4 (FINALIZED)
**Status**: FINALIZED — 2026-04-02 by claude-opus-4.6

### Settled (all models agree — 18 items, all merged into plan)
- VDS first-deploy rollback gap: raised by claude-opus-4.6 round 1, agreed by codex-gpt5.4 round 2 — settled round 2, **applied in finalize**
- `qtest` adoption friction → replaced with `beforeEach` + `ctx.skip()`: raised by claude-opus-4.6 round 1, counter-proposed by codex-gpt5.4 round 2 — settled round 2, **applied in finalize**
- `RELEASE_TOKEN` PAT scope under-specified → fine-grained PAT with exact permissions: raised by claude-opus-4.6 round 1, agreed by codex-gpt5.4 round 2 — settled round 2, **applied in finalize**
- SonarCloud cleanup scope → operator-facing docs only: raised by claude-opus-4.6 round 1, agreed by codex-gpt5.4 round 2 — settled round 2, **applied in finalize**
- Quarantine healing race → reframed as permissions coupling, separate `QUARANTINE_TOKEN`: settled round 3, **applied in finalize**
- `integration-pr` credential exposure → explicit credentialless boundary: settled round 3, **applied in finalize**
- `ci.yml` size explosion → threshold-based decision at implementation time: settled round 3, **applied in finalize**
- Commitlint `.ts` config → uses `jiti` not `tsx`, not a risk: settled round 3, **applied in finalize**
- Deploy health check → intentional liveness/readiness split, documented: settled round 3, **applied in finalize**
- Stryker expansion target list → exists in referenced testing expansion plan: settled round 3, no change needed
- `pnpm-lock.yaml` in assets → does not contain version, assets correct: settled round 3, no change needed
- Quarantine over-engineering → proportionality note added, R18-R19 deferral option: settled round 3, **applied in finalize**
- Release job outputs → explicit step/output wiring for `new_release_published` and `new_release_version`: settled round 3, **MUST-FIX applied in finalize**
- Release job checkout → `fetch-depth: 0` and `persist-credentials: false` with PAT: settled round 3, **MUST-FIX applied in finalize**
- `test:mutation:incremental` diff range → `origin/main...HEAD` in CI: settled round 3, **MUST-FIX applied in finalize**
- Quarantine healing nightly step → concrete `pnpm test` with `QUARANTINE_ENFORCE=false` and JSON reporter: settled round 3, **applied in finalize**
- Job-name mismatch → `needs.mutation` corrected to `needs.mutation-full`: settled round 3, **MUST-FIX applied in finalize**
- Integration gate design → existing behavior preserved, documented: settled round 3, **applied in finalize**

### Contested (models disagree)
(none — all points settled and merged)

### Open (raised, not yet addressed by all)
(none — all points resolved and merged)

### Score History
| Round | Version | Model | Overall | UX & Design | A11y & Responsive | Verdict |
|-------|---------|-------|---------|-----------|--------------------|---------|
| 1 | v1 | claude-opus-4.6 | 7/10 | N/A | N/A | CONDITIONAL GO 82% |
| 2 | v1 | codex-gpt5.4 | 6/10 | N/A | N/A | CONDITIONAL GO 74% |
| 3 | v1 | claude-opus-4.6 | 7/10 | N/A | N/A | CONDITIONAL GO 80% |
| 4 | v2 (finalized) | claude-opus-4.6 | 8/10 | N/A | N/A | GO 88% |
