---
name: anvil-risoluto
description: Stateful factory orchestrator for medium and large Risoluto work. Use when the task comes from bundled roadmap issues, grouped GitHub issues, a substantial plan or requirements doc, or any multi-step change that needs brainstorming, planning, review, execution, verification, docs, tests, and a final single push. This skill is the entrypoint for resumable runs backed by .anvil/<slug>/ state.
---

# Anvil Risoluto

Run the Risoluto factory workflow from intake through final push.

Read `references/state-contract.md`, `references/phase-routing.md`, and `references/bundle-intake.md` before doing phase work.

## Core behavior

- Treat `.anvil/<slug>/` as the source of truth for the current run.
- Always read `.anvil/ACTIVE_RUN` and `.anvil/<slug>/status.json` before deciding what to do next.
- Always append to `.anvil/<slug>/pipeline.log` when phase state changes.
- Keep `pending_phases`, `pending_gates`, and `claim_counts` truthful. Do not overload one field with another concept.
- `active = true` means keep the factory moving. `active = false` means the run is intentionally paused or complete.
- Never push in the middle of the workflow. Only the final phase may push.
- Never skip docs or tests closeout. They are part of done.
- Never mark the run complete while claims, gates, docs, tests, or final push remain open.

## Input routing

Accept any of:

- issue IDs or issue URLs
- roadmap bundles from issue `#354`
- an existing requirements doc
- an existing plan doc
- a vague feature request

Route like this:

- Vague intake: harden the intake first, then run `anvil-brainstorm`
- Bundle or issue intake: create state, then run `anvil-brainstorm`
- Requirements doc: validate gaps, then run `anvil-plan`
- Existing plan: challenge it in `anvil-brainstorm`, then strengthen it in `anvil-plan`
- Existing `.anvil/<slug>/` state: resume from the recorded phase

## Owned artifacts

Own these files:

- `.anvil/<slug>/intake.md`
- `.anvil/<slug>/bundle.json`
- `.anvil/<slug>/status.json`
- `.anvil/<slug>/pipeline.log`

Initialize them with `scripts/init_anvil_run.ts`, `scripts/resolve_bundle.ts`, and `scripts/update_status.ts` when helpful.

## Phases

Drive the run through these phases:

1. intake
2. brainstorm
3. plan
4. review
5. audit
6. finalize
7. execute
8. verify
9. docs-tests-closeout
10. final-push

The factory loops when needed. Verification failures reopen execution. Audit failures reopen review. Review failures reopen planning.

## Handoffs

- `anvil-brainstorm` owns `requirements.md`
- `anvil-plan` owns `plan.md`
- `anvil-review` owns `ledger.md` and review round artifacts
- `anvil-audit` owns hostile audit artifacts
- `anvil-execute` owns execution manifests and merge state
- `anvil-verify` owns `claims.md`, `verify-charter.md`, `docs-impact.md`, `tests-impact.md`, and `verification/`
- `simplify` owns the post-merge cleanup pass

## Loop discipline

- Cap review rounds at 3
- Cap audit reopen rounds at 2
- Cap verify cycles at 3
- Cap gate reruns after fixes at 2

If a cap is exceeded, stop escalating automatically and surface the blocker clearly in `status.json` and `pipeline.log`.
