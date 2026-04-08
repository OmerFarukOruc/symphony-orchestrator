---
name: anvil-execute
description: Execute a finalized anvil plan using one integration branch and isolated worktree workers. Use after planning, review, and audit are complete. This skill owns worker dispatch, merge order, simplify, and the pre-push quality gate.
---

# Anvil Execute

Read `references/execution-contract.md`, `references/merge-order.md`, and `../anvil-risoluto/references/output-contract.md`.

## Workflow

- Create one integration branch from `main`
- When delegation is explicitly authorized, spawn isolated workers for independent implementation units
- Use `implementer_fast` for bounded units and `implementer_deep` for risky units
- When delegation is not explicitly authorized, execute units serially in the main session and say that worker dispatch was unavailable due to session policy
- Merge worker branches sequentially into the integration branch
- Run `simplify`
- Run the full quality gate
- Do not push

## Output

Write:

- `.anvil/<slug>/execution/manifest.json`
- `.anvil/<slug>/execution/merge-log.md`
- `.anvil/<slug>/execution/simplify-report.md`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/closeout.md` when execution pauses or reaches a reviewable checkpoint

## Rules

- Workers may commit locally only
- Workers must not push
- Workers must not open PRs
- Reopen execution if the quality gate fails
- Read `.anvil/<slug>/preflight.md` before starting execution. If preflight is blocked, stale, or missing required readiness checks, stop and route back to `preflight`.
- Refresh `handoff.md` with integration branch, completed units, gate results, and the exact next action.
- If execution pauses after substantive code changes, refresh `closeout.md` with honest ship state such as planning-only, local-only, pushed, or merged.
- Set `status.json.integration_branch` when the real integration branch is created. Leave it `null` before that point, and do not clear it later just because the run finished.
- Do not leave `execution/` effectively empty after real implementation work. Even a single-threaded execution pass must write a truthful manifest and merge / simplify record.
