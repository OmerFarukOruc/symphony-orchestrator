# Dependency Contract

Anvil-Risoluto is an orchestrator. It depends on other skills and verification surfaces to complete the factory loop truthfully.

## Required for the factory itself

These are non-optional. If any are missing or unusable, the run must block in `preflight` before intake starts.

- `anvil-brainstorm`
- `anvil-plan`
- `anvil-review`
- `anvil-audit`
- `anvil-execute`
- `anvil-verify`

## Conditionally required for certain runs

These become required when the run touches the corresponding surface. If required and unavailable, block in `preflight`.

- `visual-verify`
  Use when operator-visible UI, layout, CSS, or visual behavior changes.
- `ui-test`
  Use when interactive UI flows, regression-prone operator paths, or browser-driven proof is needed.
- lifecycle E2E environment for `./scripts/run-e2e.sh`
  Use when the run touches real orchestration, persistence/recovery, issue pickup, PR creation, restart resilience, or external Linear/GitHub/Codex wiring.

## Nice-to-have / optional

These may improve confidence or polish, but they must not be treated as factory blockers on their own.

These are the Impeccable commands and adjacent enhancement passes. Use them when the run benefits from extra design polish, UX critique, resilience, or presentation quality, but do not block the factory on them unless the user explicitly made them part of required scope.

- `/critique`
- `/audit`
- `/polish`
- `/optimize`
- `/harden`
- `/normalize`
- `/bolder`
- `/quieter`
- `/clarify`
- `/adapt`
- `/distill`
- `/animate`
- `/arrange`
- `/typeset`
- `/delight`
- `/colorize`
- `/onboard`
- `/overdrive`
- `/extract`
- `/teach-impeccable`

These remain optional from the factory's perspective unless the run is explicitly design-led or the user asked for an Impeccable pass as part of done.

## Preflight interpretation

The preflight phase must classify each dependency as one of:

- `required-ready`
- `required-missing`
- `conditional-required-ready`
- `conditional-required-missing`
- `conditional-not-needed`
- `optional-available`
- `optional-missing`

Only the `required-missing` and `conditional-required-missing` states block the run.
