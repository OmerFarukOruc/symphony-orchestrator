# Releasing Symphony

This document captures the release preparation checklist for the current repository.

## Before tagging

1. Confirm `package.json` version matches the intended release.
2. Confirm `README.md` describes the current shipped behavior.
3. Confirm `docs/OPERATOR_GUIDE.md`, `docs/ROADMAP_AND_STATUS.md`, and `docs/TRUST_AND_AUTH.md` still match the implementation.
4. Confirm workflow examples are safe to publish and do not contain secrets.
5. Confirm `EXECPLAN.md` does not contain stale claims that contradict the codebase.

## Validation steps

Run:

```bash
npm test
npm run build
node dist/cli.js ./WORKFLOW.example.md
```

If you have real credentials available, also run:

```bash
LINEAR_API_KEY=... npm run test:integration
```

## Public source release checklist

For a GitHub source release:

1. Create or verify the repository metadata, license, and visibility.
2. Ensure the default branch contains the validated release commit.
3. Create the tag in `vX.Y.Z` form.
4. Draft release notes from verified repository facts only.
5. Call out the current scope clearly: local single-host orchestration is shipped; multi-host SSH distribution is not.

## Suggested release notes structure

- one-paragraph overview
- key shipped features
- operator-facing API/dashboard highlights
- validation steps performed
- known current scope and limitations

## Release note guardrails

Do not claim:

- SSH or multi-host worker distribution unless it is actually implemented
- package-manager distribution if the repository is still source-only
- behavior that only exists in planning notes but not in code
