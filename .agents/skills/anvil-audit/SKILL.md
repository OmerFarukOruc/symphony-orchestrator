---
name: anvil-audit
description: Independent synthesis audit for an anvil run. Use after review convergence to catch fake compromise, vague decisions, hidden risk, and unresolved ambiguity before execution starts.
---

# Anvil Audit

Read `references/synthesis-audit.md` and `../anvil-risoluto/references/output-contract.md`.

## Workflow

- If delegation is explicitly authorized for this session, spawn one `hostile_auditor`.
- If delegation is not explicitly authorized, run the audit in the main session and record that the audit stayed single-session due to session policy.
- Give the auditor `plan.md` and `ledger.md`.
- Do not ask it to inherit the detailed review framing.

## Output

Write:

- `.anvil/<slug>/reviews/hostile-audit-round-<N>.md`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/closeout.md` when the run pauses after audit or reaches an execution-ready checkpoint

Update `status.json` and `pipeline.log` based on the verdict.

## Rules

- Reopen only substantive issues.
- Cap audit reopen rounds at 2.
- If the audit finds fake compromise, vague decisions, or unowned risk, route back to review.
- If the audit passes and the next route is `finalize`, keep the loop active by default. Only pause after audit when the run is a dry run, the user asked for a checkpoint, an approval wait is real, or a blocker exists.
- If the run pauses after an audit checkpoint, `closeout.md` must say so explicitly, including that implementation, branch, commit, or PR may still be `none yet`.
