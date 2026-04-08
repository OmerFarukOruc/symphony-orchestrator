# Escalation Playbook

Use this when review, audit, verify, or gate retry caps are hit, or when the run reaches a blocker that should not auto-loop further.

## Goals

- Stop the loop cleanly
- Preserve enough state for a fresh session or human operator to act
- Make the blocker and requested intervention explicit

## Required actions on escalation

When a cap is exceeded or a blocker should halt automation:

1. Set `active = false`
2. Set `phase_status = "blocked"`
3. Set `last_failure_reason` to one concrete sentence
4. Set `next_required_action` to one explicit operator step
5. Refresh `handoff.md`
6. Refresh `closeout.md`
7. Append a blocker entry to `pipeline.log`

## Blocker entry format

Write these facts explicitly:

- which cap or blocker triggered the stop
- what the factory already tried
- what artifact proves the problem
- what the operator should inspect first
- whether the run should resume in the same phase or reopen an earlier one

## Cap-specific guidance

### Review rounds exceeded

- Mark the run blocked in `review`
- Point the operator to `.anvil/<slug>/ledger.md` and the latest review artifact
- Ask for a decision on contested scope or risk acceptance

### Audit reopen cap exceeded

- Mark the run blocked in `audit`
- Point the operator to the latest hostile audit artifact and `ledger.md`
- Ask whether to narrow scope, accept risk, or rewrite the plan

### Verify cycles exceeded

- Mark the run blocked in `verify`
- Point the operator to `claims.md`, `verify-charter.md`, and the latest verification summary
- Ask whether to cut scope, accept risk, or reopen execution with a narrower target

### Gate rerun cap exceeded

- Mark the run blocked in `execute` or `verify`, whichever owns the failing gate
- Point the operator to failing gate evidence and the latest execution artifact
- Ask whether to keep iterating locally or split follow-up work into a new run

## Pause versus abort

- Use **paused** when the run is healthy but intentionally waiting on approval or an external event.
- Use **blocked** when the factory cannot continue safely without human intervention.
- Use **complete** only when the workflow and gates are genuinely done.

## Assistant closeout on escalation

The assistant message must include:

- current run state
- blocker and failed cap
- what was already attempted
- exact files to open first
- exact operator decision needed next
