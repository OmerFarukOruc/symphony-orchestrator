# Output Contract

Anvil outputs must serve three jobs at the same time:

1. **Human operator summary** — what happened, why it matters, and whether the run is safe to continue.
2. **Fresh-session handoff** — what a new Codex session should open first and what it should do next.
3. **Checkpoint / closeout artifact** — the current delivery state, evidence, and residual risk at any meaningful pause or ship-ready checkpoint.

## Durable artifacts

Every meaningful phase transition must refresh:

- `.anvil/<slug>/handoff.md`

Whenever the run is intentionally paused, ready for external review / PR / push, pushed, merged, or complete, also write or refresh:

- `.anvil/<slug>/closeout.md`

Do not treat `pipeline.log` as a substitute for either artifact. The log is append-only history. `handoff.md` and `closeout.md` are current-state documents.

## `handoff.md` contract

`handoff.md` is the canonical fresh-session resume note. Keep it short, current, and authoritative.

It must include:

- Run slug
- Current phase and phase status
- Whether the loop is active, paused, blocked, or complete
- One-paragraph statement of what was achieved so far
- Artifacts to open first, in order, with a short reason for each
- Verification or evidence completed so far
- Open questions, residual risks, or accepted risks
- Exact next required action

Recommended sections:

- `# Handoff`
- `## Current State`
- `## What Changed`
- `## Open First`
- `## Evidence`
- `## Open Risk`
- `## Resume Here`

Recommended `## Current State` bullets:

- `Run: <slug>`
- `Phase: <phase> (<phase_status>)`
- `Loop state: active | paused | blocked | complete`
- `Next required action: <exact imperative step>`

## `closeout.md` contract

`closeout.md` is the operator-grade checkpoint summary. It is not limited to final shipment. Use it whenever the run reaches a meaningful pause, an external handoff point, or a ship-ready / shipped state.

It must include:

- Run slug
- Current phase and whether the run is paused, active, blocked, or complete
- Branch name, commit, and PR if they exist
- Explicit `none yet` markers when branch, commit, or PR do not exist
- Whether the change is planning-only, locally prepared, pushed, or merged
- What changed or what was prepared at the subsystem level
- Verification completed so far and its result
- Docs/tests closeout status
- Remaining follow-ups or explicit `none`

Recommended sections:

- `# Closeout`
- `## Ship State`
- `## What Changed`
- `## Verification`
- `## Artifacts`
- `## Follow-up`

If the run pauses before implementation, say so explicitly. Example: `Planning checkpoint only; no code changes prepared yet.`

## Assistant message contract

Every phase-ending or run-ending assistant message must be driven by the current artifacts, not by memory alone.

At minimum include:

- **Run state**: slug, phase, and whether the run is active / paused / blocked / complete
- **Outcome**: what changed or what was decided in this phase
- **Proof**: tests, review, audit, or verification evidence
- **Artifacts**: exact files a fresh session should open first
- **Next action**: one explicit next step

If branch, commit, or PR exist, include them.

If they do not exist, say so explicitly instead of leaving the reader to infer.

If verification used ephemeral external artifacts such as E2E-created issues, PRs, or branches:

- say whether they were still open at the end of the run or intentionally cleaned up
- distinguish "created during verification" from "still present after cleanup"
- include the report directory and any surviving URLs or artifact paths that an operator can inspect

## Quality bar

An output is good only if:

- A human operator can understand status in under 30 seconds
- A fresh Codex session can resume from `status.json`, `handoff.md`, and the listed artifacts without needing hidden chat context
- `status.json`, `handoff.md`, and `closeout.md` agree on phase, loop state, and next action
- The summary is honest about what did **not** happen yet, not just what did
