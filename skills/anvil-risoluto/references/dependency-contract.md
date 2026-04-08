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
- Impeccable skill family derived from `pbakaus/impeccable`
  Use when the run materially touches operator-visible UI, UX, copy, onboarding, responsiveness, motion, design-system consistency, or frontend presentation quality. This is not a generic "maybe polish later" bucket; the factory must choose the relevant skills dynamically.

### Impeccable routing rules

For UI / UX / frontend-quality runs, the factory must route through the installed Impeccable skill family using this flow:

1. Pick the diagnostic entry point:
   - `/critique` for UX, visual hierarchy, information architecture, typography, layout, emotional resonance, onboarding feel, or overall design quality
   - `/audit` for accessibility, performance, theming, responsive behavior, resilience, or technical UI quality
2. Pick one or more follow-up skills from the findings, not from habit:
   - `/polish` for finishing-detail cleanup
   - `/optimize` for performance
   - `/harden` for resilience, overflow, i18n, and edge cases
   - `/normalize` for consistency and design-system drift
   - `/bolder` or `/quieter` for intensity tuning
   - `/clarify` for confusing copy and labels
   - `/adapt` for responsiveness and device adaptation
   - `/distill` for simplification
   - `/animate` for motion and micro-interactions
   - `/arrange` for layout and spacing composition
   - `/typeset` for typography quality
   - `/delight` for joy and personality
   - `/colorize` for palette and vibrancy
   - `/onboard` for first-run / activation flows
   - `/overdrive` for intentionally ambitious showcase UI
   - `/extract` for reusable components, tokens, and patterns
3. Use `/teach-impeccable` once when persistent design context is missing and the run is design-led or repeatedly touches the operator UI.

For preflight, proving the Impeccable family means:

- diagnostic entry points `critique` and `audit` are available
- at least one follow-up skill from the routed family is available
- any run-specific follow-up requirements already known at intake are recorded in bundle metadata or the verification plan

## Nice-to-have / optional

These may improve confidence or polish, but they must not be treated as factory blockers on their own when the run does not materially touch UI, UX, or frontend presentation quality.

The Impeccable family is optional only for non-UI and non-design-led runs. Once the run materially touches those surfaces, dynamic Impeccable routing becomes part of required scope.

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

Bundle metadata may provide explicit runtime requirements such as:

- `requires_github_auth`
- `requires_linear_api`
- `requires_docker`
- `requires_ui_test`
- `verification_surfaces`

Use those fields to avoid over-blocking preflight for local-only planning and implementation work.
