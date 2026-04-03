---
name: anvil-risoluto
description: Stateful factory orchestrator for medium and large Risoluto work. Use when the task comes from bundled roadmap issues, grouped GitHub issues, a substantial plan or requirements doc, or any multi-step change that needs brainstorming, planning, review, execution, verification, docs, tests, and a final single push. This skill is the entrypoint for resumable runs backed by .anvil/<slug>/ state.
---

# Anvil Risoluto

Run the Risoluto factory workflow from preflight through final push.

Read `references/state-contract.md`, `references/output-contract.md`, `references/phase-routing.md`, `references/bundle-intake.md`, `references/dependency-contract.md`, `references/preflight-contract.md`, `references/preflight-checks.md`, `references/codex-context-budget.md`, and `references/escalation-playbook.md` before doing phase work.

## Core behavior

- Treat `.anvil/<slug>/` as the source of truth for the current run.
- Always read `.anvil/ACTIVE_RUN` and `.anvil/<slug>/status.json` before deciding what to do next.
- If `.anvil/<slug>/handoff.md` exists, read it before resuming detailed phase work. Use it as the first human-readable resume artifact.
- Always append to `.anvil/<slug>/pipeline.log` when phase state changes.
- Refresh `.anvil/<slug>/handoff.md` after every meaningful phase transition.
- Refresh `.anvil/<slug>/closeout.md` whenever the run is intentionally paused, externally handed off, ready for review / push, or complete.
- Keep `pending_phases`, `pending_gates`, and `claim_counts` truthful. Do not overload one field with another concept.
- `active = true` means keep the factory moving. `active = false` means the run is intentionally paused or complete.
- Never push in the middle of the workflow. Only the final phase may push.
- Never skip docs or tests closeout. They are part of done.
- Never mark the run complete while claims, gates, docs, tests, or final push remain open.
- No phase is complete until `status.json`, `pipeline.log`, `handoff.md`, and the owned phase artifacts agree. If `closeout.md` exists, it must agree too.
- Keep `.anvil/ACTIVE_RUN` truthful. Do not delete it just because a run completes; the completion state belongs in the referenced run artifacts.
- Treat dependency readiness as first-class state. Do not begin execution until preflight has proved the required skill chain and conditional verification prerequisites are actually available.
- Preflight is mandatory. Do not skip it for fresh runs.

## Input routing

Accept any of:

- issue IDs or issue URLs
- roadmap bundles from issue `#354`
- an existing requirements doc
- an existing plan doc
- a vague feature request

Route like this:

- Vague intake: pass preflight, harden the intake, then run `anvil-brainstorm`
- Bundle or issue intake: pass preflight, create state, then run `anvil-brainstorm`
- Requirements doc: validate gaps, then run `anvil-plan`
- Existing plan: challenge it in `anvil-brainstorm`, then strengthen it in `anvil-plan`
- Existing `.anvil/<slug>/` state: resume from the recorded phase

## Dry run mode

- Use dry runs to test intake, planning, review, audit, or artifact quality without implementation.
- In a dry run, keep `dry_run = true`, never present local code changes as shipped work, and make `closeout.md` explicitly say planning-only or dry-run checkpoint when relevant.
- A dry run may stop after audit or another requested checkpoint, but it still must refresh `handoff.md`, `status.json`, and any checkpoint `closeout.md`.

## Dependencies

Required for the factory itself:

- `anvil-brainstorm`
- `anvil-plan`
- `anvil-review`
- `anvil-audit`
- `anvil-execute`
- `anvil-verify`

Conditionally required for certain runs:

- `visual-verify`
- `ui-test`
- lifecycle E2E environment for `./scripts/run-e2e.sh`

Nice-to-have / optional:

- Impeccable commands such as `/critique`, `/audit`, `/polish`, `/optimize`, `/harden`, `/normalize`, `/bolder`, `/quieter`, `/clarify`, `/adapt`, `/distill`, `/animate`, `/arrange`, `/typeset`, `/delight`, `/colorize`, `/onboard`, `/overdrive`, `/extract`, and `/teach-impeccable`

No ambiguity here: required means block the run if unavailable, conditional means required when the run touches that surface, and optional means do not block on it.

## Owned artifacts

Own these files:

- `.anvil/<slug>/intake.md`
- `.anvil/<slug>/bundle.json`
- `.anvil/<slug>/status.json`
- `.anvil/<slug>/pipeline.log`
- `.anvil/<slug>/preflight.md`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/closeout.md` when the run reaches a pause, checkpoint, or ship-ready state

Initialize them with `scripts/init_anvil_run.ts`, `scripts/resolve_bundle.ts`, and `scripts/update_status.ts` when helpful.

## Phases

Drive the run through these phases:

0. preflight
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

- Every phase refreshes `handoff.md`.
- `anvil-brainstorm` owns `requirements.md`
- `anvil-plan` owns `plan.md`
- `anvil-review` owns `ledger.md` and review round artifacts
- `anvil-risoluto` owns `preflight.md` and dependency / readiness checks during the `preflight` phase
- `anvil-audit` owns hostile audit artifacts
- `anvil-execute` owns execution manifests and merge state
- `anvil-verify` owns `claims.md`, `verify-charter.md`, `docs-impact.md`, `tests-impact.md`, and `verification/`
- `anvil-risoluto` preflight, `anvil-audit`, `anvil-execute`, `anvil-verify`, `docs-tests-closeout`, and `final-push` refresh `closeout.md` whenever they create a meaningful checkpoint or pause
- `simplify` owns the post-merge cleanup pass

## Response contract

End every phase with a concise operator-facing summary built from the current artifacts.

Always include:

- run state: slug, phase, loop state
- outcome: what changed or what was decided
- proof: review, audit, test, or verification evidence
- artifacts: exact files to open first
- next action: one explicit step

If branch, commit, or PR do not exist yet, say so explicitly.

## Execution truthfulness

- Do not invent an integration branch name at intake.
- Set `status.json.integration_branch` only when the branch actually exists.
- Once a branch, commit, or PR exists, propagate them into `status.json`, `handoff.md`, `closeout.md`, and the assistant summary.

## Loop discipline

- Cap review rounds at 3
- Cap audit reopen rounds at 2
- Cap verify cycles at 3
- Cap gate reruns after fixes at 2

If a cap is exceeded, stop escalating automatically and surface the blocker clearly in `status.json` and `pipeline.log`.
