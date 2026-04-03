---
name: anvil-execute
description: Execute a finalized anvil plan using one integration branch and isolated worktree workers. Use after planning, review, and audit are complete. This skill owns worker dispatch, merge order, simplify, and the pre-push quality gate.
---

# Anvil Execute

Read `references/execution-contract.md` and `references/merge-order.md`.

## Workflow

- Create one integration branch from `main`
- Spawn isolated workers for independent implementation units
- Use `implementer_fast` for bounded units and `implementer_deep` for risky units
- Merge worker branches sequentially into the integration branch
- Run `simplify`
- Run the full quality gate
- Do not push

## Output

Write:

- `.anvil/<slug>/execution/manifest.json`
- `.anvil/<slug>/execution/merge-log.md`
- `.anvil/<slug>/execution/simplify-report.md`

## Rules

- Workers may commit locally only
- Workers must not push
- Workers must not open PRs
- Reopen execution if the quality gate fails
