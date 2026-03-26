---
name: verify
description: Run the full CI-mirror quality gate (build, lint, format, test, dead code analysis). Use before committing or when you want to validate all changes pass CI.
---

# /verify — Full CI Gate

Run the complete pre-push quality gate that mirrors CI. This is the same sequence enforced by `.husky/pre-push`.

## Steps

Run these commands sequentially — stop on first failure:

```bash
pnpm build && pnpm lint && pnpm format:check && pnpm test && pnpm knip
```

## On Failure

1. **Build failure** → Fix TypeScript compilation errors first. Check `packages/shared/` if the error involves `@symphony/shared`.
2. **Lint failure** → Run `pnpm lint:fix` to auto-fix, then re-verify. Manual fixes needed for complexity or naming violations.
3. **Format failure** → Run `pnpm format` to auto-fix, then re-verify.
4. **Test failure** → Read the failing test, understand the assertion, fix the root cause. Do not skip or weaken tests.
5. **Knip failure** → Remove unused exports/files flagged by knip. Check if the export is used in tests before removing.

## After Success

Report: "All 5 checks passed — ready to commit." Include a one-line summary of what was verified (e.g., "47 tests passed, 0 lint warnings, no dead exports").
