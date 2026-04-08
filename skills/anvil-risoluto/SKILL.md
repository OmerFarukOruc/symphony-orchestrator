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
- Refresh `.anvil/<slug>/closeout.md` whenever the run is intentionally paused, externally handed off, ready for review / push, complete, or another phase contract needs a truthful checkpoint artifact while the loop stays active.
- Keep `pending_phases`, `pending_gates`, and `claim_counts` truthful. Do not overload one field with another concept.
- Use canonical phase names in machine state: `preflight`, `intake`, `brainstorm`, `plan`, `review`, `audit`, `finalize`, `execute`, `verify`, `docs-tests-closeout`, `final-push`. Skill names such as `anvil-brainstorm` describe ownership, not `status.json.phase` values.
- `active = true` means keep the factory moving. `active = false` means the run is intentionally paused or complete.
- Checkpoint artifacts are not pause commands. Writing `handoff.md` or `closeout.md` for a review-ready, audit-ready, or execution-ready checkpoint must not flip the loop to paused by itself.
- Never push in the middle of the workflow. Only the final phase may push.
- Never skip docs or tests closeout. They are part of done.
- Never mark the run complete while claims, gates, docs, tests, or final push remain open.
- No phase is complete until `status.json`, `pipeline.log`, `handoff.md`, and the owned phase artifacts agree. If `closeout.md` exists, it must agree too.
- Keep `.anvil/ACTIVE_RUN` truthful. Do not delete it just because a run completes; the completion state belongs in the referenced run artifacts.
- Treat dependency readiness as first-class state. Do not begin execution until preflight has proved the required skill chain and conditional verification prerequisites are actually available.
- Preflight is mandatory. Do not skip it for fresh runs.
- Respect the current Codex delegation policy. If the user has not explicitly asked for subagents, delegation, or parallel agent work, do not call `spawn_agent`; run the factory in the main session and say so when it matters.
- When explicit delegation is authorized, prefer the local `.codex/agents/*.toml` pool for phase-specialized work instead of inventing ad hoc agent roles.
- When a run touches operator-visible UI, UX, onboarding, copy, responsiveness, motion, design-system consistency, or frontend presentation quality, dynamically route through the installed Impeccable skill family derived from `pbakaus/impeccable` instead of treating polish as a vague afterthought. Start with the right diagnostic entry point, then choose the follow-up skills based on the actual findings.

## Input routing

Accept any of:

- issue IDs or issue URLs
- roadmap bundles from issue `#354`
- an existing requirements doc
- an existing plan doc
- a vague feature request

Route like this:

- Vague intake: pass preflight, initialize run state, harden the intake, then run `anvil-brainstorm`
- Bundle or issue intake: pass preflight, initialize run state, then run `anvil-brainstorm`
- Requirements doc: pass preflight, initialize run state, seed `requirements.md` plus `bundle.json`, validate gaps, then run `anvil-plan`
- Existing plan: pass preflight, initialize run state, treat the plan as a draft to challenge in `anvil-brainstorm`, then strengthen it in `anvil-plan`
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
- the Impeccable skill family for UI / UX / frontend-quality runs:
  - start with `/critique` for design, UX, hierarchy, typography, layout, onboarding, intensity, or overall product-feel diagnosis
  - start with `/audit` for accessibility, performance, theming, responsive behavior, resilience, or anti-pattern diagnosis
  - then choose one or more follow-up skills dynamically from `/polish`, `/optimize`, `/harden`, `/normalize`, `/bolder`, `/quieter`, `/clarify`, `/adapt`, `/distill`, `/animate`, `/arrange`, `/typeset`, `/delight`, `/colorize`, `/onboard`, `/overdrive`, and `/extract`
  - use `/teach-impeccable` once when persistent design context is missing and the run is design-led or repeatedly touches the operator UI

Nice-to-have / optional:
- Impeccable skills remain optional only for runs that do not materially touch UI, UX, or frontend presentation quality

No ambiguity here: required means block the run if unavailable, conditional means required when the run touches that surface, and optional means do not block on it.

## Local Agent Pool

When the user explicitly authorizes delegation, use the repo-local `.codex/agents/` roster as the default subagent map:

- `bundle_mapper` for intake hardening
- `repo_mapper` for codebase seam mapping
- `plan_reviewer` for fresh-eye hostile review
- `hostile_auditor` for audit
- `implementer_fast` and `implementer_deep` for execution units
- `claim_checker` for claim reconciliation
- `docs_impact_mapper` and `tests_impact_mapper` for closeout mapping
- `ui_probe` for UI verification planning
- `simplify_reuse`, `simplify_quality`, and `simplify_efficiency` for cleanup review

If delegation is not authorized in the session, do the equivalent phase work in the main session instead of silently skipping it.

## Owned artifacts

Own these files:

- `.anvil/<slug>/intake.md`
- `.anvil/<slug>/bundle.json`
- `.anvil/<slug>/status.json`
- `.anvil/<slug>/pipeline.log`
- `.anvil/<slug>/preflight.md`
- `.anvil/<slug>/handoff.md`
- `.anvil/<slug>/closeout.md` when the run reaches a pause, checkpoint, or ship-ready state

Standard subfolder layout:

- `.anvil/<slug>/reviews/`
- `.anvil/<slug>/execution/`
- `.anvil/<slug>/verification/`
- `.anvil/<slug>/verification/screenshots/`
- `.anvil/<slug>/verification/videos/`

Keep anvil-session artifacts inside this tree by default.

For any non-resume intake, initialize the run scaffold before phase work begins. Use `scripts/init_anvil_run.ts`, `scripts/resolve_bundle.ts`, and `scripts/update_status.ts` when helpful.

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

Default behavior is to continue into the next routed phase in the same session until the run is truly blocked, explicitly paused, or complete. Do not stop at plan, review, audit, finalize, execute, or verify checkpoints just because the artifacts are in a clean handoff state.

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
