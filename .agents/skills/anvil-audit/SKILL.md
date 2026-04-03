---
name: anvil-audit
description: Independent synthesis audit for an anvil run. Use after review convergence to catch fake compromise, vague decisions, hidden risk, and unresolved ambiguity before execution starts.
---

# Anvil Audit

Read `references/synthesis-audit.md`.

## Workflow

- Spawn one `hostile_auditor`.
- Give it `plan.md` and `ledger.md`.
- Do not ask it to inherit the detailed review framing.

## Output

Write:

- `.anvil/<slug>/reviews/hostile-audit-round-<N>.md`

Update `status.json` and `pipeline.log` based on the verdict.

## Rules

- Reopen only substantive issues.
- Cap audit reopen rounds at 2.
- If the audit finds fake compromise, vague decisions, or unowned risk, route back to review.
