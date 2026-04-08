# Preflight Contract

Preflight is phase 0 of the factory. It runs before intake.

## Purpose

Use preflight to answer one question:

`Is the environment healthy enough to start this run without discovering avoidable blockers mid-flight?`

## Inputs

Read at minimum:

- `.anvil/ACTIVE_RUN` when it exists
- `.anvil/<slug>/status.json`
- `.anvil/<slug>/handoff.md`
- `references/dependency-contract.md`
- `references/preflight-checks.md`

## Output

Write:

- `.anvil/<slug>/preflight.md`
- refresh `.anvil/<slug>/handoff.md`
- refresh `.anvil/<slug>/closeout.md` when preflight blocks or intentionally pauses the run

## What `preflight.md` must contain

Recommended sections:

- `# Preflight`
- `## Run State`
- `## Required Factory Skills`
- `## Git And Repo Checks`
- `## Credentials And Tooling Checks`
- `## Ready / Blocked Decision`
- `## Next Action`

At minimum include:

- run slug
- current phase and phase status
- required factory skill availability
- git cleanliness / branch / worktree status
- build readiness
- active run conflict status
- credentials or Docker readiness when needed
- exact blocker text if the run cannot proceed
- exact next required action

## Decision rules

- If any required factory skill is missing: block
- If git state, build, active run conflict, or a required credential/tooling check fails: block
- If a conditionally required dependency is already known to be required and unavailable: block
- If an optional dependency is missing: note it, but do not block
- If all required readiness checks pass: mark the run ready for `intake`

## State updates

- A passing preflight should keep the preflight record, update the log, and advance the run to the next pending phase. For a fresh run this is `intake`; for a resumed run it may be the currently pending execution or verification phase.
- A blocked preflight should set `active = false`, `phase_status = "blocked"`, and a concrete `last_failure_reason`.
- Do not proceed to intake when preflight is blocked.
