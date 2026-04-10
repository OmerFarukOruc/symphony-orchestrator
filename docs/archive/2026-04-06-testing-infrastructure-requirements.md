---
date: 2026-04-06
topic: testing-infrastructure-systematization
---

> **⚠️ ARCHIVED** — This is a historical planning artifact from April 2026. It is preserved for context but does not reflect current project state. See [ROADMAP_AND_STATUS.md](../ROADMAP_AND_STATUS.md) for the active roadmap.

# Testing Infrastructure & PR Readiness System

## Problem Frame

Risoluto's test suite is broad (333 files, 10 tiers, 86%+ coverage) but shipping is slower than it should be. Two compounding problems:

1. **Infrastructure decay** — Coverage thresholds are static and will silently erode. PR authors have no per-file coverage visibility. Nightly failures are Slack-only with no tracking. Frontend unit tests exist but never run in CI. Mutation testing times out on GitHub-hosted runners.

2. **Manual verification tax** — Every PR requires a manual checklist: build, lint, tests, docs sync, design alignment, UI verification, CI preflight. This is the real bottleneck. The test infrastructure exists, but orchestrating it is human work that should be automated.

The solution is a four-layer system: testing infrastructure that prevents decay (Layer 1), a compound Claude Code skill that orchestrates PR readiness automatically (Layer 2), a design alignment system that ensures frontend changes match the project's design soul (Layer 3), and documentation sync that keeps the Mintlify docs-site in lockstep with code (Layer 4).

**Relationship to prior work:** The [2026-04-01 testing expansion](2026-04-01-testing-expansion-requirements.md) requirements defined integration test scenarios (SQLite, OpenAPI, SSE, recovery) and the fullstack E2E project. This document is complementary — it addresses the automation, visibility, and orchestration that surrounds those tests.

### Current vs. Target State

| Area | Current | Target |
|---|---|---|
| Coverage thresholds | Static 82/73/82/82, manual bumps | Auto-ratcheting via `autoUpdate: true` |
| PR coverage visibility | None | Per-file coverage report on every PR |
| Frontend tests in CI | 28 tests exist, zero CI jobs | CI job on every PR |
| Nightly failure tracking | Slack notification only | Auto-created GitHub issues with dedup + auto-close |
| Fullstack E2E breadth | 4 specs (API/SSE scenarios) | At least one spec per frontend page (15 pages) |
| Mutation testing | Nightly times out (~6h on GH Actions 2-core) | Completes on self-hosted 16-core VDS |
| Coverage exclusion accuracy | 4 type-only files excluded | All type-only/interface-only files excluded |
| PR readiness verification | Manual checklist, human-driven | Compound skill: one command, full pipeline |
| Design alignment checking | `.impeccable.md` exists, manual reference | Automated design soul verification on frontend PRs |
| Docs-site sync | Zero CI gates, OpenAPI drifted (v0.4.0 vs v0.6.0) | OpenAPI hard gate in CI + dynamic docs sync in `/pr-ready` |

## Requirements

### Phase 0: Clean Baseline (prerequisite — must complete before Layers 1-4)

All automation layers assume a healthy starting point. Phase 0 is a one-time cleanup sprint that establishes that baseline. Nothing in Layers 1-4 should be built until Phase 0 is complete.

**OpenAPI Spec Sync**

- P1. Regenerate `docs-site/openapi.json` from the runtime `getOpenApiSpec()` to match the current v0.6.0 codebase. Resolve all divergences — missing endpoints, changed schemas, stale descriptions.
- P2. Reconcile `api-reference/endpoints.mdx` with the OpenAPI spec. The hand-authored page references endpoints not in the spec (`/steer`, Templates CRUD, Audit log, SSE `/api/v1/events`, Swagger UI). Either add these to the spec or document why they're excluded.

**Coverage Baseline**

- P3. Audit all `.ts` files under `src/` for type-only / interface-only modules. Expand the Vitest coverage exclusion list from the current 4 files to all qualifying files. Document the heuristic used.
- P4. After exclusion audit, bump coverage thresholds in `vitest.config.ts` to match actual coverage (currently 86.4/79.7/85.3/86.9). This is the clean baseline that `autoUpdate: true` will ratchet from.

**Frontend Test Validation**

- P5. Run `pnpm run test:frontend` locally and fix any failures in the 28 frontend unit tests. These have never run in CI — confirm they pass before adding a CI gate.

**Docs-Site Content Audit**

- P6. Audit all 20 MDX pages in `docs-site/` against the current codebase. For each page, verify:
  - No stale config keys, endpoints, CLI flags, or env vars
  - Code examples and curl commands use current API signatures
  - Feature descriptions match shipped behavior (not roadmap aspirations)
- P7. Update `docs-site/changelog.mdx` to include v0.5.0 and v0.6.0 entries if missing.
- P8. Fix or remove the missing `og-image.png` referenced in `docs.json` (currently `images/.gitkeep` only).

**Repo Docs Sync**

- P9. Audit `README.md`, `docs/OPERATOR_GUIDE.md`, `docs/ROADMAP_AND_STATUS.md`, `docs/CONFORMANCE_AUDIT.md`, and `EXECPLAN.md` against current behavior. Fix any stale claims, outdated examples, or missing features.

**Design Soul Refresh**

- P10. Re-run `/teach-impeccable` or manually audit `.impeccable.md` against the current frontend. Verify that:
  - All documented design tokens match actual CSS custom properties
  - Component vocabulary (`mc-*` classes) reflects what exists in `frontend/src/`
  - Any tokens or components that were added or removed since initial generation are captured
- P11. Add the Revision History section to `.impeccable.md` with the initial baseline entry.

**UI Bug Fixes**

- P12. Fix the 6 failures found in the exploratory ui-test run:
  1. `axe-settings` — 6 inputs with no accessible labels
  2. `settings-tabs` — Settings page renders blank
  3. `notifications-page` — Stuck in loading skeleton
  4. `back-forward` — SPA router desync on history navigation
  5. `axe-overview` — Color contrast + landmark violations
  6. `axe-queue` — Color contrast + missing h1

**Test Suite Health**

- P13. Run the full test suite (`pnpm test`, `pnpm run test:frontend`, `pnpm exec playwright test --project=smoke`, `pnpm exec playwright test --project=visual`) and fix any failures. The baseline must be green across all tiers.
- P14. Run `pnpm run lint`, `pnpm run format:check`, and `pnpm run knip` — fix any issues. Zero lint warnings, zero format violations, zero dead exports.

**Baseline Snapshot**

- P15. After all Phase 0 work is complete, create a tagged commit (`baseline/pre-automation`) that represents the clean state. This is the reference point for all automation layers.

### Layer 1: Testing Infrastructure

**Decay Prevention**

- R1. Enable Vitest `coverage.thresholds.autoUpdate: true` so thresholds auto-bump when coverage improves. Thresholds must never decrease without an explicit, reviewed change.
- R2. Post a per-file coverage report on every PR using `davelosert/vitest-coverage-report-action` (or equivalent). The report must show coverage for changed files and flag any file dropping below the current threshold.
- R3. Nightly CI failures must auto-create a GitHub issue per distinct failing test (not per job). Issues must deduplicate — a second failure of the same test updates the existing issue instead of creating a duplicate. Issues auto-close when the test passes on the next nightly run.

**CI Gap Closure**

- R4. Add a `test:frontend` CI job that runs `pnpm run test:frontend` on every PR. Failure blocks merge.
- R5. Audit all `.ts` files under `src/` for type-only / interface-only modules (zero executable code). Add them to the Vitest coverage exclusion list. Document the audit criteria so future type-only files are excluded at creation time.
- R6. Expand fullstack E2E coverage to all 15 frontend pages. Each page gets at least one spec that validates real API wiring — navigation, data loading, and primary user action. Pages: overview, queue, issue, runs, logs, attempt, observability, settings, notifications, git, workspaces, containers, templates, audit, setup.

**Infrastructure**

- R7. Set up the 16-core 64GB VDS as a GitHub Actions self-hosted runner. Migrate the nightly mutation testing job to run on it. Mutation suite must complete without timeout.

### Layer 2: PR Readiness Skill (`/pr-ready`)

**Core Behavior**

- R8. Create a compound Claude Code skill invoked as `/pr-ready` that orchestrates the full PR verification and shipping pipeline. The skill analyzes `git diff` to determine change scope (frontend, backend, docs, or mixed) and adapts its pipeline accordingly.
- R9. The skill operates in two phases: **verify** (report all findings) then **fix** (apply changes on user approval). It must not auto-fix without explicit approval — report everything first, fix on approval.
- R10. After fixes are approved, the skill commits, pushes, and creates the PR with a generated description. Full pipeline: verify → report → fix (on approval) → commit → push → PR.

**Verification Pipeline**

- R11. **Always-run gates** (regardless of change scope): build, lint, format check, typecheck, unit tests with coverage. These run first and block further verification if they fail.
- R12. **Backend-change gates**: run relevant integration tests, check API contract alignment, verify no unhandled error paths in changed modules.
- R13. **Frontend-change gates**: run frontend unit tests (`pnpm run test:frontend`), invoke `/visual-verify` for UI screenshot verification, check design alignment against `.impeccable.md`, run adversarial UI tests via available browser testing skills.
- R14. **Docs sync check**: diff-driven documentation sync for both repo docs and the Mintlify docs-site. See the dedicated Docs Sync section below for full requirements (R35-R42).
- R15. **CI preflight**: predict whether CI will pass based on local verification results. Flag any gate that would fail in CI but passed locally (e.g., environment-dependent tests).

**Dynamic Skill Orchestration**

The skill orchestrates existing specialized skills rather than reimplementing their capabilities. Each skill stays focused and maintainable; `/pr-ready` is the smart router that picks the right tools based on git diff analysis.

- R16. The skill must detect change scope from `git diff` and dynamically load only the relevant sub-skills. Frontend changes load design and UI testing skills; backend-only changes skip them. The loading decision is based on file paths in the diff, not manual configuration.
- R17. Browser automation skills are **orchestrated, not merged**. Three abstraction levels exist and must stay separate:

| Level | Skills | CLI | Role in `/pr-ready` |
|---|---|---|---|
| **Primitives** | `agent-browser`, `browser` (browserbase) | `agent-browser`, `browse` | Not called directly — used by strategy skills |
| **Strategy** | `/visual-verify`, `/ui-test`, `expect-cli`, `/dogfood` | Mixed | Called by `/pr-ready` based on context |
| **Design** | `/normalize`, `/audit`, `/clarify`, `/colorize` | None (code-only) | Called for design alignment checks |

- R18. The skill routes to browser testing strategies based on context:

| Context | Strategy Skill | CLI | Why This One |
|---|---|---|---|
| Frontend code changed | `/visual-verify` | `agent-browser` | Risoluto-specific routes, selectors, pixel diff |
| PR with UI changes (pre-merge) | `/ui-test --diff` | `browse` | Diff-driven adversarial testing, HTML report for reviewers |
| Final verification gate | `expect-cli` (subagent) | `expect-cli` | Enforcement: blocks until browser tests pass with 0 failures |
| Exploratory QA (on-demand) | `/dogfood` | `agent-browser` | Free-roam, repro-first, video evidence — not per-PR |

- R19. Install `million/expect` (`expect-cli`) as the final verification gate. The skill invokes `expect` as a subagent that runs in parallel with the main thread — it blocks completion claims until browser tests pass with 0 failures.
- R20. Design and code-only skills are loaded based on change type:

| Change Type | Skills to Load | Purpose |
|---|---|---|
| Frontend (`frontend/src/**`) | `/normalize`, `/audit` | Design drift detection, a11y/perf/theming audit |
| Styles/theming | `/normalize`, `/colorize` | Token alignment, color consistency |
| UX copy / labels | `/clarify` | Microcopy quality |
| Backend (API changes) | (none — built-in contract checks) | API contract verification |
| Docs | (none — built-in doc sync check) | Documentation freshness |

**Output**

- R21. The skill must produce a structured verdict report before any fixes. The report groups findings by verification phase:

```
PR Readiness Report
═══════════════════
Scope: frontend + backend (mixed)

── Mechanical Gates ──────────────────────────────────
✅ Build .............. pass
✅ Lint ............... pass
✅ Format ............. pass
✅ Typecheck .......... pass
✅ Unit tests ......... pass (247/247, +2 new)
✅ Frontend tests ..... pass (28/28)
⚠️ Coverage ........... 86.4% → 85.9% (src/http/new-handler.ts: 0%)

── Browser Verification ──────────────────────────────
✅ Visual verify ...... pass (3 pages, 0 pixel regressions)
✅ UI tests ........... pass (12/12 adversarial, report: .context/ui-test-report.html)
✅ Expect gate ........ pass (0 failures)

── Impeccable Pipeline ───────────────────────────────
⚠️ /audit ............. 2 findings (P1: color-contrast, P2: missing landmark)
   → /harden ......... fix available (add aria-label to 3 inputs)
   → /normalize ...... fix available (replace hardcoded #333 with var(--text))
✅ /critique .......... 8.2/10, no downstream skills triggered

── Design Soul Sync ──────────────────────────────────
📝 New pattern ........ mc-timeline (propose add to .impeccable.md?)
🗑️ Stale entry ........ mc-status-dot removed in this PR (propose remove?)

── Documentation ─────────────────────────────────────
⚠️ Docs sync .......... OPERATOR_GUIDE.md needs update (new /api/v1/foo)

Verdict: READY WITH FIXES (4 items — approve to apply)
```

- R22. When fixes are approved and applied, the skill creates the commit and PR. The PR description must include the verification report summary, not just a changelog.

### Layer 3: Design Soul

**Design Context System**

- R23. The project's design soul is defined in `.impeccable.md` (already exists). This document is the single source of truth for brand personality, design tokens, color system, typography, and component vocabulary. The PR readiness skill must reference it for all frontend alignment checks.
- R24. Design alignment verification must check: correct use of CSS custom properties (not hardcoded values), adherence to the `mc-*` component class naming convention, spacing consistent with the token scale, and typography matching the defined font stack and hierarchy.

**Living Soul — Per-PR Evolution**

- R25. `.impeccable.md` is a living document, not a one-time snapshot. It must evolve with the frontend through a propose-and-approve workflow integrated into `/pr-ready`.
- R26. **New pattern detection:** When a frontend PR introduces a component, token, color, or interaction pattern not documented in `.impeccable.md`, the skill runs `/extract` on the changed files and proposes a soul extension in the verdict report. The user approves (pattern added to `.impeccable.md`) or skips (pattern stays undocumented). The soul only changes with explicit approval.
- R27. **Stale entry detection:** When a frontend PR removes or replaces a component/token that `.impeccable.md` still references, the skill flags the stale entry and proposes removal. This prevents the soul from accumulating references to patterns that no longer exist in code.
- R28. **Revision tracking:** Every update to `.impeccable.md` must include a revision entry with the commit hash and date. Format:

```markdown
## Revision History
<!-- Newest first. Auto-maintained by /pr-ready soul sync. -->
| Date | Commit | Change |
|---|---|---|
| 2026-04-06 | a1b2c3d | Added mc-timeline component, --timeline-gap token |
| 2026-04-01 | e4f5g6h | Removed deprecated mc-status-dot, replaced by mc-badge |
| 2026-03-15 | i7j8k9l | Initial soul generated by /teach-impeccable |
```

This provides traceability — you can always see when and why the design soul changed.

**Impeccable Skill Integration — Full Composition Pipeline**

- R29. When frontend files are in the diff, the PR readiness skill runs the full impeccable composition pipeline. This follows the `leadsTo` graph from the impeccable skill ecosystem — diagnostics first, then downstream skills triggered only by actual findings.

- R30. **Phase 1 — Diagnostics (always run on frontend changes):**

| Diagnostic | What it checks | Downstream skills triggered by findings |
|---|---|---|
| `/audit` | A11y, performance, theming, responsive, anti-patterns (P0-P3 severity) | `/harden` (a11y/edge cases), `/optimize` (perf), `/normalize` (theming drift), `/adapt` (responsive gaps), `/clarify` (copy issues) |
| `/critique` | Visual hierarchy, info architecture, cognitive load, emotional resonance (scored) | `/arrange` + `/typeset` (hierarchy), `/colorize` + `/bolder` (visual monotony), `/distill` + `/quieter` (excess complexity), `/polish` (pre-ship) |

- R31. **Phase 2 — Quality and enhancement (only skills triggered by diagnostic findings):** Each downstream skill runs only if the diagnostic produced findings that map to it. No findings = no downstream skills = fast pass. The routing follows impeccable's published `leadsTo` and `combinesWith` relationships:

```
/audit findings
  ├─ a11y violations → /harden (edge cases, error states, i18n, overflow)
  ├─ performance issues → /optimize (loading, rendering, bundle size)
  ├─ theming drift → /normalize (realign to .impeccable.md tokens)
  ├─ responsive gaps → /adapt (breakpoints, fluid layouts, touch targets)
  └─ copy/label issues → /clarify (microcopy, error messages, labels)

/critique findings
  ├─ weak hierarchy → /arrange (layout, spacing) + /typeset (font choices, sizing)
  ├─ visual monotony → /colorize (strategic color) + /bolder (amplify impact)
  ├─ excess complexity → /distill (simplify) + /quieter (tone down)
  └─ micro-detail issues → /polish (final quality pass)

combinesWith chains (run together when co-triggered):
  /normalize + /clarify + /adapt (consistency trio)
  /animate + /delight (motion + personality)
  /harden + /optimize (production-readiness pair)
  /arrange + /distill + /adapt (layout refinement chain)
  /typeset + /bolder + /normalize (typography upgrade chain)
```

- R32. **Intensity guard:** `/bolder` and `/quieter` are opposites. If both are triggered (unlikely but possible from different diagnostic findings), the skill must ask the user which direction to take rather than running both.

- R33. The `/teach-impeccable` setup skill must have been run at least once for the project (already done — `.impeccable.md` exists). The PR readiness skill should verify `.impeccable.md` exists and warn if it's missing rather than failing silently.

- R34. Enhancement skills (`/animate`, `/delight`, `/overdrive`, `/onboard`) are never auto-triggered by diagnostics. They are available as manual invocations when the user explicitly wants creative enhancement. The PR readiness skill may suggest them in the report ("consider `/animate` for the new transition") but must not invoke them without explicit request.

### Layer 4: Documentation Sync

The Mintlify docs-site at `docs-site/` (hosted at docs.risolu.to) has 20 MDX pages, an OpenAPI spec, and zero CI gates. The OpenAPI spec is already drifted (v0.4.0 vs code v0.6.0). This layer ensures docs stay in sync with code through a combination of a CI hard gate for the OpenAPI spec and diff-driven narrative docs sync in `/pr-ready`.

**CI Gate — OpenAPI Spec Sync**

- R35. Add a CI job that compares the runtime-generated OpenAPI spec (from `getOpenApiSpec()`) against `docs-site/openapi.json`. If they diverge (new endpoints, changed schemas, missing descriptions), the PR fails. This catches API drift even when `/pr-ready` is skipped.
- R36. The CI gate must run on every PR that touches files under `src/http/`. Pure frontend or docs-only PRs skip this check.

**Local Docs Sync in `/pr-ready`**

- R37. The docs sync module uses **dynamic code-to-docs mapping** — not a static mapping table. For each changed file in the diff, it scans `docs-site/**/*.mdx` for references to the changed code (endpoint paths, config keys, function names, component names, CLI flags). This eliminates the drift-prone static mapping table problem identified in the Dosu blog research.
- R38. The Risoluto docs-site has a known structure. The skill should understand these primary mappings and validate them dynamically:

| Code Area | Docs Pages to Check | What to Look For |
|---|---|---|
| `src/http/routes/` | `api-reference/endpoints.mdx`, `openapi.json` | Endpoint paths, methods, schemas |
| `src/config/` | `guides/configuration.mdx` | Config keys, defaults, descriptions |
| `src/orchestrator/` | `concepts/runtime.mdx`, `concepts/how-it-works.mdx` | Scheduling, timeouts, state machine |
| `src/workspace/` | `concepts/how-it-works.mdx` | Workspace lifecycle |
| `src/notification/` | `guides/notifications.mdx` | Event types, setup, verbosity |
| `src/http/server.ts` | `guides/security.mdx` | Auth, rate limiting, trust model |
| `frontend/src/` | `guides/dashboard.mdx` | Page descriptions, shortcuts, SSE events |
| `src/agent-runner/` | `concepts/runtime.mdx`, `guides/configuration.mdx` | Agent config, sandbox, stall detection |
| `src/webhook/` | `guides/notifications.mdx`, `operating/troubleshooting.mdx` | Webhook setup, health, debugging |

- R39. For each docs-site page affected by code changes, the skill checks:
  1. **Stale references** — endpoint paths, config keys, or CLI flags mentioned in the doc that no longer exist in code
  2. **Missing coverage** — new endpoints, config options, or features added in the diff that the doc doesn't mention
  3. **Example accuracy** — code examples or curl commands that use changed API signatures
- R40. The skill proposes doc updates in the verdict report. On approval, it edits the affected `docs-site/*.mdx` files directly. All doc changes ship in the same PR as the code change — no separate follow-up PR.
- R41. Repo-level docs (`README.md`, `docs/OPERATOR_GUIDE.md`, `docs/ROADMAP_AND_STATUS.md`, `EXECPLAN.md`) are also checked for references to changed behavior. These use the same dynamic mapping approach.
- R42. The docs sync module follows `doc-it` principles: never invent fields/flags that don't exist in code, match existing voice and formatting, make the smallest edit that fixes the gap, and flag gaps rather than filling them with assumptions.

## Success Criteria

**Phase 0 — Clean Baseline:**
- All test tiers pass green (unit, frontend, smoke, visual).
- Zero lint warnings, zero format violations, zero dead exports.
- `docs-site/openapi.json` matches runtime-generated spec exactly.
- All 20 docs-site MDX pages verified against current codebase — no stale references.
- `.impeccable.md` reflects actual frontend state with revision history.
- All 6 ui-test failures fixed and passing in a re-run.
- Coverage thresholds bumped to match actual coverage (ready for ratcheting).
- Tagged baseline commit exists.

**Layer 1 — Testing Infrastructure:**
- Coverage thresholds in `vitest.config.ts` are always >= actual coverage (autoUpdate enforces this).
- Every PR shows a coverage delta report before merge.
- A nightly test failure produces a trackable GitHub issue within the same CI run.
- Frontend unit tests block PRs on failure, same as backend tests.
- Nightly mutation suite completes successfully on the self-hosted runner.
- All 15 frontend pages have at least one fullstack E2E spec passing in nightly CI.
- Coverage metrics reflect true executable code — no inflation from type-only files.

**Layer 2 — PR Readiness Skill:**
- Running `/pr-ready` produces a complete verification report within 5 minutes for a typical PR.
- The skill correctly detects change scope and loads only relevant sub-skills.
- No PR created by the skill has failed CI due to a gate that the skill could have caught locally.
- The fix-on-approval workflow feels natural — report is clear, fixes are surgical.

**Layer 3 — Design Soul:**
- Frontend PRs that violate design tokens or component conventions are flagged before merge.
- Design drift findings reference specific `.impeccable.md` tokens, not vague "looks wrong" feedback.
- New patterns are explicitly flagged rather than silently passing.
- The impeccable composition pipeline follows the `leadsTo` graph — diagnostic findings automatically trigger the right downstream skills.
- No downstream skill runs without a triggering diagnostic finding (zero false invocations).
- Enhancement skills (`/animate`, `/delight`, `/overdrive`) are never auto-triggered, only suggested.

**Layer 4 — Documentation Sync:**
- The OpenAPI spec in `docs-site/openapi.json` never diverges from the runtime-generated spec. CI blocks PRs that introduce drift.
- No endpoint, config option, or CLI flag ships without its docs-site page being updated in the same PR.
- Dynamic mapping detects stale references in docs without requiring a static mapping table.
- Doc updates match existing Mintlify page voice and formatting.

## Scope Boundaries

- **Not in scope:** Writing new integration test scenarios (SQLite, OpenAPI, SSE) — covered by the [2026-04-01 testing expansion](2026-04-01-testing-expansion-requirements.md).
- **Not in scope:** Changing the test framework (Vitest, Playwright, Stryker stay as-is).
- **Not in scope:** Increasing coverage thresholds manually. The ratchet handles this organically.
- **Not in scope:** Load testing CI integration (exists locally, separate concern).
- **Not in scope:** Building a custom design system from scratch. `.impeccable.md` already exists and is the source of truth.
- **Not in scope:** The PR readiness skill replacing human code review. It handles mechanical verification; architecture and logic review remain human.

## Key Decisions

- **Systematize, not sprint:** All improvements ship as a cohesive system across four layers.
- **Report first, fix on approval:** The PR readiness skill never auto-fixes. It reports findings, then applies fixes only after explicit user approval.
- **Full pipeline to PR:** After approval, the skill handles commit → push → PR creation with a verification-enriched description.
- **Dynamic skill loading:** The skill adapts to change scope via git diff analysis, not manual flags. Frontend changes trigger design/UI skills; backend-only changes skip them.
- **All 15 pages for fullstack E2E:** No prioritized subset — every page gets at least one spec.
- **Self-hosted runner for mutation only:** The VDS handles mutation; other CI stays on GitHub-hosted runners.
- **Install million/expect:** Adds browser verification enforcement as a final completion gate.
- **Orchestrate, don't merge browser skills:** 7 browser skills across 3 ecosystems stay separate. `/pr-ready` routes to the right one based on context. Two CLIs (`browse` vs `agent-browser`) are incompatible — merging would create unnecessary complexity.
- **Design soul via .impeccable.md:** No new design system document. The existing `.impeccable.md` is the source of truth, verified programmatically by the skill.
- **Docs sync local-first:** No CI-based Claude Code Action for narrative docs. `/pr-ready` handles docs sync locally with dynamic mapping. OpenAPI spec gets a hard CI gate as a safety net.
- **Dynamic code-to-docs mapping:** No static mapping table (which itself drifts). Scan doc content for references to changed code instead.

## Dependencies / Assumptions

- The VDS (16-core, 64GB) is available and can be configured as a GH Actions self-hosted runner without network/firewall restrictions.
- `davelosert/vitest-coverage-report-action` is compatible with Vitest's current coverage reporter output format.
- The 15 frontend pages listed are exhaustive as of 2026-04-06. Router changes may add pages later.
- Nightly failure → GitHub issue automation can use GitHub Actions + `gh` CLI; no external service dependency.
- `expect-cli` (million/expect) can be installed globally via npm and runs against localhost.
- All impeccable skills are installed globally at `~/.claude/skills/` and callable from the compound skill.
- `.impeccable.md` remains the single design truth source. If it becomes stale, the skill's design checks degrade.
- The PR readiness skill runs locally (not in CI). It's a Claude Code skill, not a GitHub Action.

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Needs research] What GitHub Action or workflow pattern best implements per-test issue creation with dedup and auto-close?
- [Affects R5][Needs research] How many type-only files exist beyond the 4 currently excluded? What heuristic reliably identifies them?
- [Affects R6][Technical] Should fullstack E2E specs reuse the existing `fullstack` Playwright project or define a separate one?
- [Affects R7][Technical] What runner labels, security hardening, and auto-update config does the self-hosted VDS runner need?
- [Affects R2][Technical] Does `davelosert/vitest-coverage-report-action` support the `json-summary` reporter Vitest currently uses?
- [Affects R8][Technical] What is the optimal skill file structure for the compound `/pr-ready` skill? Single orchestrator file with inline logic, or orchestrator + sub-skill delegation?
- [Affects R16][Technical] What is the precise file-path-to-skill mapping for dynamic loading? Need to enumerate all path patterns and their corresponding skill invocations.
- [Affects R18][Needs research] Does `expect-cli` work with Risoluto's localhost setup without additional configuration?
- [Affects R13][Technical] How should the skill handle cases where `agent-browser` or `browse` CLI is not available? Graceful skip with warning, or hard failure?
- [Affects R35][Technical] Should the OpenAPI CI gate compare JSON structurally (ignoring key order) or use exact byte comparison? Structural diff is more robust but needs a tool like `oasdiff`.
- [Affects R37][Needs research] What is the most reliable heuristic for scanning MDX files for references to changed code? Regex for endpoint paths, config keys, and function names, or AST-based analysis?
- [Affects R40][Technical] When docs-site pages need updates, should the skill edit MDX directly or propose a diff for the user to review? MDX has Mintlify-specific components that require careful handling.

## Next Steps

→ `/ce-plan` for structured implementation planning
