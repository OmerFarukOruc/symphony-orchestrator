# State Contract

Each run lives at `.anvil/<slug>/`.

Required files:

- `intake.md`: how the request was interpreted
- `bundle.json`: structured bundle metadata
- `handoff.md`: canonical fresh-session resume note, refreshed after every meaningful phase transition
- `closeout.md`: operator-grade checkpoint summary, required whenever the run is intentionally paused after meaningful progress, handed off externally, ready for review / push, or complete
- `preflight.md`: environment and dependency readiness checkpoint before intake starts
- `requirements.md`: brainstormed requirements
- `plan.md`: finalized execution plan
- `ledger.md`: review settlements and contested points
- `claims.md`: explicit claims that must be proven
- `verify-charter.md`: dynamic verification questions and routes
- `docs-impact.md`: docs that must change and whether they changed
- `tests-impact.md`: tests that must change and whether they changed
- `pipeline.log`: append-only narrative timeline
- `status.json`: machine-readable run state

Repo-level pointer:

- `.anvil/ACTIVE_RUN`: the slug of the current foreground run. It should point at the latest active or operator-selected run. Completion does not require deleting it, but the referenced run's `status.json` must make the completion state obvious.

Supporting directories:

- `reviews/`
- `execution/`
- `verification/`
- `verification/screenshots/`
- `verification/videos/`

Standard layout rules:

- Keep run-owned artifacts inside `.anvil/<slug>/` unless the user explicitly asks for a cross-run archive copy.
- Phase summaries and machine state live at the run root, for example `status.json`, `handoff.md`, `closeout.md`, `claims.md`, and `tests-impact.md`.
- Review artifacts live under `reviews/`.
- Execution artifacts live under `execution/`.
- Verification reports and summaries live under `verification/`.
- Verification screenshots live under `verification/screenshots/`.
- Verification videos live under `verification/videos/`.
- Do not write new anvil-session screenshots or QA reports to repo-global archive folders such as `docs/archive/` by default.

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

Schema note:

- `schema_version = 2` is the current shape with explicit `pending_phases`, `pending_gates`, and canonical `claim_counts`.
- If older state is encountered, normalize it forward before acting, then write the normalized form back to disk.
- Legacy compatibility: older runs may persist `phase = "complete"` or `phase_status = "complete"`. Normalize those to the current terminal meaning before resuming.
- Machine state should use canonical phase names only. Legacy skill-name aliases such as `anvil-brainstorm` may be normalized on read, but they should not be written back as phase values.

Semantics:

- `active = true` means the factory should keep looping automatically until it reaches a real blocker or done.
- `active = false` means the run is explicitly paused or finished; hooks should not auto-continue it.
- `pending_phases` contains future factory phases such as `intake`, `brainstorm`, `execute`, and `verify`.
- `preflight.md` is the authoritative answer to whether the run can proceed into intake without avoidable environment or dependency blockers.
- `pending_gates` contains executable quality gates only, such as `build`, `lint`, `format:check`, `test`, `playwright-smoke`, and `playwright-visual`.
- `claim_counts` is the canonical machine-readable claim summary. Keep the legacy numeric aliases `open_claims` and `failed_claims` in sync for hook compatibility.
- If `claims.md` exists, claim counts should reflect the markdown statuses there rather than hand-maintained ad hoc lists.
- `handoff.md` must agree with `status.json` on `slug`, `phase`, `phase_status`, loop state, and `next_required_action`.
- `closeout.md` must agree with `status.json` on current checkpoint state, branch / push status, and whether the run is still planning-only, locally prepared, pushed, or merged.
- `integration_branch` should remain `null` until an actual integration branch exists. Once created, keep it truthful and do not silently clear it at closeout.

Use repo-relative paths inside artifacts whenever possible.
