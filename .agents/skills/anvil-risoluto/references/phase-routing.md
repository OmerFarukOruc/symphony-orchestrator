# Phase Routing

Use this routing table:

- `intake` -> `anvil-brainstorm`
- `brainstorm` -> `anvil-plan`
- `plan` -> `anvil-review`
- `review` -> `anvil-audit`
- `audit` -> `finalize`
- `finalize` -> `anvil-execute`
- `execute` -> `anvil-verify`
- `verify` -> `docs-tests-closeout` or back to `execute`
- `docs-tests-closeout` -> `final-push` or back to `verify`

Reopen conditions:

- Major plan weakness -> back to `plan`
- Audit reopen -> back to `review`
- Failing quality gate -> stay in `execute`
- Failed claim -> back to `execute`
- Missing docs or tests -> `docs-tests-closeout`

State tracking rules:

- Put future workflow steps in `pending_phases`, not `pending_gates`.
- Reserve `pending_gates` for executable quality checks only.
- Set `active = false` only when the run is intentionally paused or truly complete.

Completion conditions:

- no open or failed claims
- no pending phases
- no pending gates
- docs status complete
- tests status complete
- final push complete
