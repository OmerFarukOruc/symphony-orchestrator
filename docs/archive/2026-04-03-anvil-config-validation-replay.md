# Anvil Replay Prep -- Config Validation Bundle

This note preserves the comparison baseline and gives the next fresh Codex session the replay prompts to use.

## Preserved baseline

The original dry run is intentionally kept at:

- `.anvil/config-validation-bundle/`

Key artifacts:

- `.anvil/config-validation-bundle/intake.md`
- `.anvil/config-validation-bundle/requirements.md`
- `.anvil/config-validation-bundle/plan.md`
- `.anvil/config-validation-bundle/ledger.md`
- `.anvil/config-validation-bundle/reviews/review-round-1.md`
- `.anvil/config-validation-bundle/reviews/hostile-audit-round-1.md`
- `.anvil/config-validation-bundle/status.json`
- `docs/plans/2026-04-03-003-feat-config-validation-bundle-execplan.md`

The live pointer `.anvil/ACTIVE_RUN` was removed on purpose so the next session starts fresh.

## Fresh slug to use

Use this new slug for the replay:

- `config-validation-bundle-replay-01`

An empty target directory already exists at:

- `.anvil/config-validation-bundle-replay-01/`

## Prompt 1 -- replay the same dry-run shape

This prompt mirrors the successful dry run. It is the best apples-to-apples rerun.

```text
Use the repo-local anvil factory for a fresh dry run. Do not resume any previous .anvil run. Create a new slug named config-validation-bundle-replay-01.

Bundle: Config & Validation Bundle from roadmap epic #354 covering issues #261, #263, #309, #325, #330, and #336.

Do intake, brainstorm, plan, review, and audit only. Stop after audit and pause before finalize or execute.

Write the normal .anvil artifacts and the ExecPlan. Keep the run resumable for a future session.
```

## Prompt 2 -- shorter prompt to test scaffold strength

Use this after Prompt 1 if you want to test how much the scaffold carries by itself.

```text
Fresh anvil dry run for the Config & Validation bundle from #354. Use a new slug config-validation-bundle-replay-02, do intake through audit, then pause before finalize.
```

## Prompt 3 -- resume test for a later fresh session

Use this only after a new replay run exists and you want to test cross-session continuation.

```text
Resume the repo-local anvil run at .anvil/config-validation-bundle-replay-01 and continue from the recorded status. Do not restart the workflow from intake.
```

## What to compare after the rerun

- Did the new session create the right slug without trying to resume the old one?
- Did it keep `pending_phases` and `pending_gates` separate?
- Did it write a coherent `status.json` without hand-fixing?
- Did the requirements, ledger, and audit stay as strong as the first dry run?
- Could another session continue from the new replay artifacts without extra chat context?
