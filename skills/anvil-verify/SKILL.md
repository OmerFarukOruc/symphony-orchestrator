---
name: anvil-verify
description: Verification and closeout phase for an anvil run. Use after execution to generate claims, route dynamic verification, prove backend and frontend wiring, confirm docs and tests impact, reopen work when needed, and decide whether the run is ready for the final push.
---

# Anvil Verify

Read `references/claim-types.md`, `references/verify-charter-template.md`, `references/verification-routing.md`, and `../anvil-risoluto/references/output-contract.md`.

## Workflow

- Generate or refresh `.anvil/<slug>/claims.md`
- Generate `.anvil/<slug>/verify-charter.md`
- Keep `status.json.claim_counts`, `open_claims`, and `failed_claims` aligned with `claims.md`
- Route verification based on the charter and the actual diff
- For runs that touch real lifecycle behavior, orchestration, persistence/recovery, issue pickup, PR creation, restart resilience, or external Linear/GitHub/Codex wiring, include the live lifecycle E2E route via `./scripts/run-e2e.sh` when prerequisites are available.
- Use existing repo skills instead of rebuilding them:
  - `visual-verify`
  - `ui-test`
  - the Impeccable skill family, chosen dynamically for UI / UX / frontend-quality runs:
    - start with `/critique` for design / UX diagnosis or `/audit` for technical UI diagnosis
    - then route into the matching follow-up skills such as `/polish`, `/optimize`, `/harden`, `/normalize`, `/clarify`, `/adapt`, `/distill`, `/animate`, `/arrange`, `/typeset`, `/delight`, `/colorize`, `/onboard`, `/bolder`, `/quieter`, `/overdrive`, or `/extract`
- When delegation is explicitly authorized, use the local agent pool for claim, docs, tests, and UI mapping work where it reduces context load:
  - `claim_checker`
  - `docs_impact_mapper`
  - `tests_impact_mapper`
  - `ui_probe`
- Write docs and tests impact summaries
- Reconcile evidence back into claims
- Reopen execution if claims fail

## Output

Write:

- `.anvil/<slug>/claims.md`
- `.anvil/<slug>/verify-charter.md`
- `.anvil/<slug>/docs-impact.md`
- `.anvil/<slug>/tests-impact.md`
- `.anvil/<slug>/verification/`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/closeout.md` when the run is paused, reopened, or ready for final push

## Rules

- Verification is not report-only. Failed claims reopen work.
- Docs and tests are first-class done criteria.
- A run is not final-push ready until all claims are `passed` or intentionally `accepted-risk`.
- `pending_phases` tracks the remaining workflow steps. `pending_gates` tracks executable checks only.
- If `./scripts/run-e2e.sh` runs and fails, inspect the generated `e2e-reports/<run-id>/e2e-summary.json`, phase results, and stderr / event artifacts, reopen execution, fix the real issue, and rerun until the relevant gates pass or the run is honestly blocked by external prerequisites.
- If the lifecycle E2E is skipped because credentials, Docker, or external test infrastructure are unavailable, record that explicitly in verification output. Do not pretend it passed.
- If the lifecycle E2E creates transient external artifacts such as a PR or issue and later cleans them up, say that explicitly in the verification summary. Do not stop at "PR created" if cleanup later closed it or deleted its branch.
- When lifecycle E2E runs, include the run id or report directory, the final cleanup state, and any still-inspectable URL or local artifact path.
- Keep verification artifacts inside `.anvil/<slug>/verification/` by default. Do not scatter screenshots, videos, or reports into repo-global archive folders during an anvil run unless the user explicitly wants a durable cross-run archive copy.
- For UI / UX / frontend-quality runs, do not stop at `visual-verify` alone. Verification must explicitly choose the relevant Impeccable diagnostic entry point and any follow-up skills that match the surfaced issues or intended polish scope.
- Refresh `handoff.md` with claim counts, verification evidence, docs/tests status, and the exact next action.
- Refresh `closeout.md` when verification creates a meaningful checkpoint so an operator can tell whether the run reopened execution, stopped for follow-up, or is ready for final push.
