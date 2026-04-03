---
name: anvil-plan
description: Generate or strengthen the execution plan for an anvil run. Use after requirements are clarified, or when an existing plan needs to be brought up to the Risoluto ExecPlan standard with exact files, tests, verification, docs impact, and implementation units.
---

# Anvil Plan

Read `.agents/PLANS.md` first. The plan output must respect that contract.

Read `references/codex-plan-template.md`, `references/plan-quality-bar.md`, and `../anvil-risoluto/references/output-contract.md`.

## Purpose

Write an execution-ready plan that a new Codex session could use with only the plan file and the working tree.

## Inputs

Use:

- `.anvil/<slug>/requirements.md`
- `.anvil/<slug>/bundle.json`
- repo context from `repo_mapper`
- docs and tests impact from `docs_impact_mapper` and `tests_impact_mapper`

## Output

Write both:

- `docs/plans/YYYY-MM-DD-NNN-<type>-<slug>-execplan.md`
- `.anvil/<slug>/plan.md`
- `.anvil/<slug>/handoff.md`

## Requirements

- The repo plan must be an ExecPlan-compatible living document.
- Include `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective`.
- Add a concrete `Implementation Units` section.
- For each unit, include owned files, dependencies, execution target, tests impact, docs impact, and verification surface.
- Use repo-relative paths.
- Keep planning-time unknowns separate from implementation-time unknowns.
- Refresh `handoff.md` with the planning outcome, the strongest artifacts to open first, any residual planning risk, and whether the next action is review or a planning reopen.
