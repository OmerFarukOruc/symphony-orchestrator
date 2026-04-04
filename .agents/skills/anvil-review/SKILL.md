---
name: anvil-review
description: Hostile review phase for an anvil plan. Use after planning to pressure-test the plan for correctness, sequencing, regression risk, missing tests, and unclear blast radius. This skill owns the review ledger and round artifacts.
---

# Anvil Review

Read `references/ledger-format.md`, `references/review-rubric.md`, and `../anvil-risoluto/references/output-contract.md`.

## Workflow

- Run the first hostile review in the main session.
- If delegation is explicitly authorized for this session, spawn one `plan_reviewer` fresh-eye subagent for the second pass.
- If delegation is not explicitly authorized, run the fresh-eye second pass in the main session and say that the subagent lane was unavailable due to session policy.
- Merge both views into `.anvil/<slug>/ledger.md`.
- Track `Settled`, `Contested`, and `Open` points.
- Cap review rounds at 3.

## Output

Write:

- `.anvil/<slug>/ledger.md`
- `.anvil/<slug>/reviews/review-round-<N>.md`
- `.anvil/<slug>/handoff.md`

## Rules

- Prioritize correctness, regression risk, test coverage, blast radius, and rollback safety.
- Do not weaken the plan just to reach agreement.
- Reopen planning if the plan is not execution-ready.
- Refresh `handoff.md` with settled / contested / open counts, the dominant risk signal, the review verdict, and the exact route forward: reopen `plan` or continue to `audit`.
- If review converges and the next route is `audit`, keep the loop active by default. Do not mark the run paused just because the review artifacts are complete, unless the user asked for a checkpoint, the run is a dry run, or a real blocker exists.
- Do not collapse the round into `ledger.md` alone. `reviews/review-round-<N>.md` must preserve the actual critique, reasoning, and verdict for that round.
