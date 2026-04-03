# Replay Dry Run

This replay run is preserved as a fresh, resumable dry run that reached:

- intake
- brainstorm
- plan
- review
- audit

It is intentionally paused before:

- finalize
- execute
- verify
- docs-tests-closeout
- final-push

The original baseline remains at `.anvil/config-validation-bundle/` for comparison. This replay lives at `.anvil/config-validation-bundle-replay-01/` and is the slug that future sessions should resume from.

`.anvil/ACTIVE_RUN` currently points to `config-validation-bundle-replay-01`.
