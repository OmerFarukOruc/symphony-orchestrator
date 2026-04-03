# State Contract

Each run lives at `.anvil/<slug>/`.

Required files:

- `intake.md`: how the request was interpreted
- `bundle.json`: structured bundle metadata
- `requirements.md`: brainstormed requirements
- `plan.md`: finalized execution plan
- `ledger.md`: review settlements and contested points
- `claims.md`: explicit claims that must be proven
- `verify-charter.md`: dynamic verification questions and routes
- `docs-impact.md`: docs that must change and whether they changed
- `tests-impact.md`: tests that must change and whether they changed
- `pipeline.log`: append-only narrative timeline
- `status.json`: machine-readable run state

Supporting directories:

- `reviews/`
- `execution/`
- `verification/`

Required statuses in `status.json`:

- `schema_version`
- `phase`
- `phase_status`
- `active`
- `review_round`
- `audit_round`
- `verify_cycle`
- `pending_phases`
- `pending_gates`
- `gate_results`
- `claim_counts`
- `open_claims`
- `failed_claims`
- `docs_status`
- `tests_status`
- `push_status`
- `integration_branch`
- `last_failure_reason`
- `next_required_action`
- `dry_run`
- `updated_at`

Semantics:

- `active = true` means the factory should keep looping automatically until it reaches a real blocker or done.
- `active = false` means the run is explicitly paused or finished; hooks should not auto-continue it.
- `pending_phases` contains future factory phases such as `finalize`, `execute`, and `verify`.
- `pending_gates` contains executable quality gates only, such as `build`, `lint`, `format:check`, `test`, `playwright-smoke`, and `playwright-visual`.
- `claim_counts` is the canonical machine-readable claim summary. Keep the legacy numeric aliases `open_claims` and `failed_claims` in sync for hook compatibility.
- If `claims.md` exists, claim counts should reflect the markdown statuses there rather than hand-maintained ad hoc lists.

Use repo-relative paths inside artifacts whenever possible.
