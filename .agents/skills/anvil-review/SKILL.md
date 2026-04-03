---
name: anvil-review
description: Hostile review phase for an anvil plan. Use after planning to pressure-test the plan for correctness, sequencing, regression risk, missing tests, and unclear blast radius. This skill owns the review ledger and round artifacts.
---

# Anvil Review

Read `references/ledger-format.md` and `references/review-rubric.md`.

## Workflow

- Run the first hostile review in the main session.
- Spawn one `plan_reviewer` fresh-eye subagent for the second pass.
- Merge both views into `.anvil/<slug>/ledger.md`.
- Track `Settled`, `Contested`, and `Open` points.
- Cap review rounds at 3.

## Output

Write:

- `.anvil/<slug>/ledger.md`
- `.anvil/<slug>/reviews/review-round-<N>.md`

## Rules

- Prioritize correctness, regression risk, test coverage, blast radius, and rollback safety.
- Do not weaken the plan just to reach agreement.
- Reopen planning if the plan is not execution-ready.
