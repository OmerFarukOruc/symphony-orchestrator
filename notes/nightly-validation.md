# Nightly validation mode

The CI workflow now supports a workflow-dispatch-only validation mode.

## Inputs

- `nightly_validation_mode`
  - `none`
  - `fullstack-fail`
  - `visual-fail`
  - `live-fail`
- `disable_linear_write`
- `disable_r2_upload`

## Behavior

Validation failure is only activated when:
- event is `workflow_dispatch`
- the selected validation mode matches the job

Each selected job runs `scripts/nightly-validation-fail.ts` before the real test command. The script emits a known marker and exits non-zero.

This provides:
- deterministic fingerprinting
- no need to corrupt product code
- safe manual validation of deduplication, R2 upload, and Linear intake behavior

## Rollback toggles

- `disable_linear_write=true` keeps intake in observation mode and prevents Linear mutations
- `disable_r2_upload=true` disables R2 publishing for the run and keeps fallback evidence behavior
