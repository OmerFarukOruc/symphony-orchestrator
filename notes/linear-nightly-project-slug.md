# Linear nightly project slug wiring

The nightly Linear intake workflow expects the secret:

- `LINEAR_PROJECT_SLUG`

This should be the Linear project slug used by Risoluto for automation-created failure issues. The live intake script reads it from the environment and passes it into `LinearClient`, which resolves the project via `buildProjectLookupQuery()` before creating issues.

## Expected GitHub Actions secrets

Required for live mode:
- `LINEAR_API_KEY`
- `LINEAR_PROJECT_SLUG`

`LINEAR_PROJECT_SLUG` should be the exact Linear project slug where nightly failure issues should be created. This is the same slug concept already used by the existing `LinearClient` project lookup logic.

Optional:
- `LINEAR_NIGHTLY_STATE`
- `LINEAR_ATTACHMENT_ICON_URL`

## Live mode behavior

If both `LINEAR_API_KEY` and `LINEAR_PROJECT_SLUG` are present, the nightly intake job runs in live mode and creates or updates Linear issues.

If either secret is missing, the workflow falls back to dry-run mode automatically.
