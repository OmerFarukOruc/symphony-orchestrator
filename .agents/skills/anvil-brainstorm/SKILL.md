---
name: anvil-brainstorm
description: Interactive requirements hardening for an anvil run. Use after bundle intake or when an existing plan or requirements doc needs to be challenged, clarified, and made concrete before planning. This skill is for multi-step work where planning should not invent product behavior.
---

# Anvil Brainstorm

Read `references/intake-hardening.md`, `references/brainstorm-template.md`, and `../anvil-risoluto/references/output-contract.md` before starting.

## Purpose

Turn the current intake into a concrete requirements artifact that planning can execute against without inventing missing behavior.

## Rules

- Ask one question at a time.
- Resolve product and UX ambiguity here, not in planning.
- Challenge bundled work when the grouping looks wrong, the scope is mushy, or success is unclear.
- Keep the conversation concrete: user-visible behavior, scope boundaries, dependencies, risks, and success criteria.
- If the input is already a plan, treat that plan as a draft to challenge, not as settled truth.

## Output

Write:

- `.anvil/<slug>/requirements.md`
- `.anvil/<slug>/handoff.md`

At minimum include:

- Problem frame
- Requirements with stable IDs
- Scope boundaries
- Success criteria
- Key decisions
- Dependencies or assumptions
- Outstanding questions

If blockers remain, record them explicitly instead of pretending the brainstorm is done.

Refresh `handoff.md` so a fresh session can see whether the run is blocked or planning-ready, what changed in the requirements, which artifacts to open first, and the exact next action.
