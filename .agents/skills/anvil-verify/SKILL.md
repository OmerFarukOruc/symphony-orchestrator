---
name: anvil-verify
description: Verification and closeout phase for an anvil run. Use after execution to generate claims, route dynamic verification, prove backend and frontend wiring, confirm docs and tests impact, reopen work when needed, and decide whether the run is ready for the final push.
---

# Anvil Verify

Read `references/claim-types.md`, `references/verify-charter-template.md`, and `references/verification-routing.md`.

## Workflow

- Generate or refresh `.anvil/<slug>/claims.md`
- Generate `.anvil/<slug>/verify-charter.md`
- Keep `status.json.claim_counts`, `open_claims`, and `failed_claims` aligned with `claims.md`
- Route verification based on the charter and the actual diff
- Use existing repo skills instead of rebuilding them:
  - `visual-verify`
  - `ui-test`
  - Impeccable skills when findings warrant them
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

## Rules

- Verification is not report-only. Failed claims reopen work.
- Docs and tests are first-class done criteria.
- A run is not final-push ready until all claims are `passed` or intentionally `accepted-risk`.
- `pending_phases` tracks the remaining workflow steps. `pending_gates` tracks executable checks only.
