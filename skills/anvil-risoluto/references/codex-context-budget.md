# Codex Context Budget

Keep the working set small. Read the minimum artifacts that let the current phase act truthfully.

## Global rules

- Always read `.anvil/ACTIVE_RUN` and `.anvil/<slug>/status.json` first.
- Read `.anvil/<slug>/handoff.md` next when it exists.
- Treat `pipeline.log` as history, not as the primary decision surface.
- Read `plan.md`, `requirements.md`, `ledger.md`, and verification artifacts on demand unless the current phase explicitly depends on them.
- Prefer reopening only the artifacts listed below for the current phase rather than loading the entire run directory.

## Phase budgets

### Preflight

Must read:

- `.anvil/ACTIVE_RUN` when it exists
- `.anvil/<slug>/status.json`
- `.anvil/<slug>/handoff.md`
- `references/dependency-contract.md`
- `references/preflight-contract.md`
- `references/preflight-checks.md`

Read on demand:

- `.anvil/<slug>/bundle.json`
- `pipeline.log`
- `closeout.md`

### Intake

Must read:

- `.anvil/ACTIVE_RUN`
- `.anvil/<slug>/status.json`
- `.anvil/<slug>/handoff.md` if present
- `.anvil/<slug>/preflight.md`

Read on demand:

- `.anvil/<slug>/intake.md`
- `.anvil/<slug>/bundle.json`

### Brainstorm

Must read:

- `.anvil/<slug>/status.json`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/intake.md`
- `.anvil/<slug>/bundle.json`

Read on demand:

- existing `requirements.md`
- `pipeline.log`

### Plan

Must read:

- `.anvil/<slug>/status.json`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/requirements.md`
- `.anvil/<slug>/bundle.json`

Read on demand:

- previous `plan.md`
- `pipeline.log`

### Review

Must read:

- `.anvil/<slug>/status.json`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/plan.md`

Read on demand:

- `.anvil/<slug>/requirements.md`
- previous review artifacts

### Audit

Must read:

- `.anvil/<slug>/status.json`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/plan.md`
- `.anvil/<slug>/ledger.md`

Read on demand:

- review round artifacts
- `requirements.md`

### Execute

Must read:

- `.anvil/<slug>/status.json`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/preflight.md`
- `.anvil/<slug>/plan.md`
- `.anvil/<slug>/ledger.md`
- latest audit artifact

Read on demand:

- `requirements.md`
- `pipeline.log`

### Verify

Must read:

- `.anvil/<slug>/status.json`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/claims.md` if present
- `.anvil/<slug>/verify-charter.md` if present
- execution artifacts relevant to the changed units

Read on demand:

- `plan.md`
- `ledger.md`
- `pipeline.log`

### Docs / Tests Closeout

Must read:

- `.anvil/<slug>/status.json`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/docs-impact.md`
- `.anvil/<slug>/tests-impact.md`

Read on demand:

- verification summaries
- execution manifest

### Final Push

Must read:

- `.anvil/<slug>/status.json`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/closeout.md` if present
- docs/tests impact summaries
- verification summary

Read on demand:

- `pipeline.log`
- `plan.md`

## Fresh thread guidance

- Prefer a fresh thread for each major phase transition.
- Prefer resume-in-thread only when you are continuing the same bounded phase and the current thread already contains irreplaceable local reasoning.
- If artifact loading would exceed reasonable context, summarize into `handoff.md` and reopen from the files rather than dragging old chat context forward.
