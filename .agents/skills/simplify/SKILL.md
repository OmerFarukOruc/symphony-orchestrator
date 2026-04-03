---
name: simplify
description: Post-merge cleanup pass for the Risoluto anvil factory. Use after implementation units are merged into the integration branch to review changed code for reuse, structural quality, and efficiency, then apply safe simplifications without changing intended behavior.
---

# Simplify

Read `references/simplify-rubric.md`.

## Workflow

- Review the current diff
- Spawn these three read-only agents in parallel:
  - `simplify_reuse`
  - `simplify_quality`
  - `simplify_efficiency`
- Aggregate the findings in the main session
- Apply safe simplifications directly
- Record what changed

## Output

Write:

- `.anvil/<slug>/execution/simplify-report.md` when running inside an active anvil run

If no anvil run is active, summarize the findings directly in the current session.

## Rules

- Preserve behavior
- Prefer reuse of existing helpers
- Avoid cleanup churn outside the changed scope
- Do not push or create PRs
