# Phase Routing

Use this routing table:

- `preflight` -> `intake`
- `intake` -> `brainstorm` (`anvil-brainstorm`)
- `brainstorm` -> `plan` (`anvil-plan`)
- `plan` -> `review` (`anvil-review`)
- `review` -> `audit` (`anvil-audit`)
- `audit` -> `finalize`
- `finalize` -> `execute` (`anvil-execute`)
- `execute` -> `verify` (`anvil-verify`)
- `verify` -> `docs-tests-closeout` or back to `execute`
- `docs-tests-closeout` -> `final-push` or back to `verify`

Use the canonical phase names above inside `status.json.phase` and `pending_phases`.
Skill names describe which skill owns the work for that phase; they are not phase
values.

Reopen conditions:

- Major plan weakness -> back to `plan`
- Audit reopen -> back to `review`
- Missing required factory skill or conditional verification prerequisite -> stay in `preflight` as blocked
- Failing quality gate -> stay in `execute`
- Failed claim -> back to `execute`
- Missing docs or tests -> `docs-tests-closeout`

State tracking rules:

- Put future workflow steps in `pending_phases`, not `pending_gates`.
- Reserve `pending_gates` for executable quality checks only.
- When a phase finishes cleanly and the next route is already known, advance to that next phase in the same turn and keep `active = true`.
- Terms like review-ready, audit-ready, and execution-ready describe artifact quality, not an implicit pause.
- Set `active = false` only when the run is intentionally paused or truly complete.
- If a review, audit, verify, or gate retry cap is exceeded, stop the loop and follow `references/escalation-playbook.md`.

Completion conditions:

- no open or failed claims
- no pending phases
- no pending gates
- docs status complete
- tests status complete
- final push complete
