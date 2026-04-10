# Full frontend operator surface refactor

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md` from the repository root.

## Purpose / Big Picture

This work refactors the operator-facing Risoluto frontend so the dashboard reads faster, looks more deliberate, and stays trustworthy as the product grows from a local agent runner into an autonomous engineering operating system. After this plan is complete, an operator should be able to move across Overview, Queue, Issue detail, Runs, Logs, Setup, Settings, Templates, and the system-observe surfaces with a cleaner shell, more consistent primitives, clearer state semantics, and fewer legacy style layers.

The most important observable outcome is not “new CSS exists.” It is that the dashboard becomes easier to scan without losing any operator workflows. Setup gating must still redirect correctly. Keyboard navigation and the command palette must still work. Trust-critical state such as stale data, runtime health, live activity, and issue status must remain immediately legible in both themes.

## Progress

- [x] (2026-04-09 21:05Z) Confirmed the dedicated worktree and branch: `/home/oruc/Desktop/workspace/risoluto-worktrees/impeccable-full-refactor` on `ui/impeccable-full-refactor`.
- [x] (2026-04-09 21:05Z) Validated the design context by reading `.impeccable.md`; no separate teach step is required because the repo already contains explicit users, brand personality, theme philosophy, and live design rules.
- [x] (2026-04-09 21:05Z) Reconstructed the baseline from committed code because `docs/refactor/STEP1_BASELINE.md` and `docs/refactor/STEP2_EVALUATION_INVENTORY.md` are absent in this worktree.
- [x] (2026-04-09 21:05Z) Mapped the current operator route inventory and confirmed the surface grouping: Operate (`/`, `/queue`, `/issues/:id`, `/issues/:id/runs`, `/issues/:id/logs`, `/logs/:id`, `/attempts/:id`), Configure (`/settings`, `/config`, `/secrets`, `/templates`, `/setup`, `/welcome` redirect), and Observe/System (`/observability`, `/notifications`, `/git`, `/workspaces`, `/containers`, `/audit`).
- [x] (2026-04-09 21:05Z) Audited the shell and style foundations: `frontend/src/main.ts`, `frontend/src/router.ts`, `frontend/src/ui/shell.ts`, `frontend/src/ui/sidebar.ts`, `frontend/src/ui/header.ts`, `frontend/src/ui/command-palette.ts`, `frontend/src/styles/design-system.css`, `frontend/src/styles/tokens.css`, `frontend/src/styles/primitives.css`, `frontend/src/styles/components.css`, `frontend/src/styles/shell.css`, and `frontend/src/styles/shell-responsive.css`.
- [x] (2026-04-09 21:05Z) Phase 3 foundation rationalization pass 1 completed. Applied the first cleanup patch across shell and primitive foundations, introduced shared breakpoint and layering tokens, replaced the command-palette inline layout style with CSS, converted shell focus handling to shared tokenized focus rings, and removed several shell-only hardcoded color and layering values.
- [x] (2026-04-09 21:13Z) Verified the Phase 3 foundation patch with `pnpm run build` and `pnpm test`. Build passed after installing worktree dependencies with `rtk pnpm install`. Vitest passed with `273` test files passed and `3767` tests passed, `1` skipped.
- [x] (2026-04-09 21:20Z) Ran focused browser verification for the shell and command palette. Verified overview shell rendering, route announcer presence, command-palette open/arrow navigation/escape close, and mobile drawer open/close behavior. Captured artifacts under `docs/archive/`.
- [ ] (2026-04-09 21:22Z) Phase 4 shell and global primitive refactor in progress. Completed: foundation token/layer cleanup and proof that the current 760px mobile drawer path works. Remaining: remove stale responsive overlap from `frontend/src/styles/shell.css`, then continue rationalizing shell/global primitives without changing operator workflows.
- [ ] Phase 5 Operate surface refactor: Overview, Queue, Issue, Runs, Logs, Attempt.
- [ ] Phase 6 Configure surface refactor: Settings, Setup, Templates.
- [ ] Phase 7 Observe/System surface refactor: Observability, Notifications, Git, Workspaces, Containers, Audit.
- [ ] Phase 8 extract shared patterns, remove superseded UI code, and update operator documentation and `.impeccable.md` if the live frontend language materially changes.
- [ ] Phase 9 final verification: diagnostics, build, regression tests, visual verification, and closeout.

## Surprises & Discoveries

- Observation: the baseline refactor docs called out by the user are not present in this worktree.
  Evidence: `docs/refactor/STEP1_BASELINE.md` and `docs/refactor/STEP2_EVALUATION_INVENTORY.md` both resolved as missing during route and docs inventory.

- Observation: the current foundation already has a strong design language, but token usage is inconsistent.
  Evidence: `frontend/src/styles/tokens.css` defines stroke widths and status tint tokens, while `frontend/src/styles/shell.css` still hardcodes values such as `outline: 2px solid var(--text-accent)`, `border-left-width: 3px`, and stale-banner mix percentages.

- Observation: responsive behavior is split across incompatible systems.
  Evidence: `frontend/src/ui/sidebar.ts` and `frontend/src/ui/header.ts` use a shared runtime breakpoint value of `760px`, while `frontend/src/styles/shell.css` contains additional viewport rules at `900px` and `600px`, and `frontend/src/styles/shell-responsive.css` adds container queries at `960px` and `720px` plus a `760px` mobile rule.

- Observation: left-edge accent borders are deeply embedded beyond the shell.
  Evidence: a repo-wide style search found 62 `border-left` or `border-left-width` matches across `shell.css`, `primitives.css`, `palette.css`, `components.css`, `queue.css`, `overview.css`, `logs.css`, `settings.css`, `workspace.css`, `observability.css`, and other page-specific style files.

- Observation: explicit z-index tokens exist but are barely used.
  Evidence: `frontend/src/styles/polish-tokens.css` defines `--z-dropdown`, `--z-sticky`, `--z-overlay`, `--z-modal`, and `--z-toast`, but a search found only one actual `var(--z-...)` consumer in `frontend/src/styles/polish-brand.css`.

- Observation: the shell/token cleanup patch is stable under real interaction, not just static build checks.
  Evidence: browser verification confirmed shell render, command-palette open, `ArrowDown` list navigation, `Escape` close, mobile header toggle visibility, and mobile drawer open/close with no console warnings or errors.

- Observation: `frontend/src/styles/shell.css` still contains an older viewport-driven responsive layer that overlaps with the working container-query/mobile-drawer system in `frontend/src/styles/shell-responsive.css`.
  Evidence: `shell.css` still has `@media (max-width: 900px)` and `@media (max-width: 600px)` rules for header/sidebar behavior, while `shell-responsive.css` already handles `@container (max-width: 960px)`, `@container (max-width: 720px)`, and `@media (max-width: 760px)` for the verified mobile path.

## Decision Log

- Decision: start with the shell and cross-cutting primitive layers before editing any feature page.
  Rationale: the user explicitly asked to begin with baseline validation and shell/primitives first, and these files control every operator-facing surface.
  Date/Author: 2026-04-09 / OpenAI gpt-5.4

- Decision: reconstruct the baseline from committed code rather than waiting for missing refactor docs.
  Rationale: the user explicitly allowed reconstruction from committed code if the baseline docs were missing, and blocking on absent docs would violate the autonomous workflow requirement.
  Date/Author: 2026-04-09 / OpenAI gpt-5.4

- Decision: keep the first implementation patch scoped to foundation rationalization rather than a broad page-by-page redesign.
  Rationale: the first safe leverage comes from normalizing tokens, layering, focus treatment, and shell primitives. That reduces regression risk before the larger page refactors.
  Date/Author: 2026-04-09 / OpenAI gpt-5.4

- Decision: verify the first shell/token patch in the browser before continuing to more invasive shell cleanup.
  Rationale: UI edits under `frontend/src/` require visual verification, and shell regressions would affect every operator-facing route. Browser proof reduced the risk of carrying a broken shell into later phases.
  Date/Author: 2026-04-09 / OpenAI gpt-5.4

- Decision: treat the old `900px` / `600px` viewport rules in `frontend/src/styles/shell.css` as stale overlap now that the `760px` drawer path and container-query shell rules have been verified.
  Rationale: the current responsive system already works in practice and uses the shared tokenized mobile path. Keeping both systems increases breakpoint drift and makes later shell work harder to reason about.
  Date/Author: 2026-04-09 / OpenAI gpt-5.4

## Outcomes & Retrospective

Phase 3 pass 1 achieved its intended outcome. The shell/token foundation now has shared breakpoint ownership in TypeScript, tokenized shell layering, tokenized stale-banner styling, and tokenized focus-ring usage in the shell entry points. The command palette no longer depends on inline layout styles. The first pass also proved that these changes are real, not theoretical: build passed, the full Vitest suite passed, and focused browser verification showed that overview rendering, route announcements, command-palette interaction, and mobile drawer behavior still work.

What remains after this checkpoint is not “did the patch work?” but “how much stale shell overlap is still present?” The next shell/global-primitives pass should remove the remaining responsive drift in `frontend/src/styles/shell.css` and continue simplifying the shell without breaking the operator contract.

## Context and Orientation

The frontend lives under `frontend/src/`. `frontend/src/main.ts` is the application bootstrap. It imports all global styles, initializes theme handling, shell layout, the sidebar, the header, the command palette, keyboard support, routing, polling, and the live event stream. It also registers every route. `frontend/src/router.ts` is the lightweight client router that renders pages into the shell outlet and emits `router:navigate` events for screen-reader announcements and active-nav updates.

The shell is defined in `frontend/src/ui/shell.ts`, `frontend/src/ui/sidebar.ts`, `frontend/src/ui/header.ts`, and `frontend/src/ui/command-palette.ts`. The shell owns the skip link, the stale-state banner, route announcements, primary navigation, the mobile drawer behavior, and the page header command surface. These files are trust-critical because they control how every operator-facing screen is reached and understood.

The style system starts at `frontend/src/styles/design-system.css`, then extends through `frontend/src/styles/tokens.css`, `frontend/src/styles/primitives.css`, `frontend/src/styles/components.css`, `frontend/src/styles/shell.css`, and `frontend/src/styles/shell-responsive.css`. A “token” here means a named CSS custom property such as `--text-accent` or `--stroke-accent` that gives a reusable semantic value instead of a hardcoded number or color. A “primitive” here means a reusable base UI pattern such as a page header, button, badge, drawer, toast, or list item.

The current live design language is already documented in `.impeccable.md`. The product is meant to feel transparent, calm, and inevitable. Copper is reserved for brand and primary action emphasis. Runtime meaning must come from semantic status colors. Both light and dark themes are first-class. Major surfaces should stay visually sharp and composed rather than soft or decorative.

The current operator route inventory is as follows. Operate surfaces: `frontend/src/pages/overview.ts`, `queue.ts`, `issue.ts`, `runs.ts`, `logs.ts`, and `attempt.ts`. Configure surfaces: `settings.ts`, `templates.ts`, and `setup.ts`, plus aliases `/config` and `/secrets` that route back into settings anchors. Observe/System surfaces: `observability.ts`, `notifications.ts`, `git.ts`, `workspaces.ts`, `containers.ts`, and `audit.ts`. The `/welcome` route is only a redirect to `/settings`, and setup gating can redirect all routes to `/setup` until configuration completes.

## Plan of Work

The work proceeds in nine phases that match the user-approved order. First, validate the design context and reconstruct the baseline. This is already complete. Second, maintain a written route and surface inventory inside this ExecPlan so future edits stay grounded in the real operator surface area. Third, rationalize the style system before changing feature pages. That means moving important cross-cutting values such as layering and shell alert colors into shared tokens, removing easy hardcoded drift, and cleaning foundation code that fights the design system, such as inline palette styles or shell-specific focus rules.

Once the first rationalization patch lands and is verified, refactor the shell and global primitives. In practical terms this means the sidebar, header, command palette, page rhythm primitives, and foundational list/drawer/status patterns. Only after those foundations are stable should the Operate pages be redesigned and normalized. The Configure pages come next because they share many form and shell patterns but also have setup-gating constraints. Observe/System pages follow afterward because they depend on the same shared visual vocabulary and often contain dense tables, status panels, and event streams.

Throughout the page refactors, reuse the existing `mc-*` component vocabulary instead of inventing a second system. If a new pattern is necessary, define it as a reusable primitive and apply it across at least two surfaces before considering the work complete. Remove superseded legacy classes only after all known consumers have been migrated. After every UI edit under `frontend/src/`, run visual verification before considering the step done.

## Concrete Steps

Run all commands from the repository root at `/home/oruc/Desktop/workspace/risoluto-worktrees/impeccable-full-refactor`.

For baseline verification and planning:

    pwd
    git branch --show-current
    git status --short

Expected result: the working directory is the dedicated worktree, the branch is `ui/impeccable-full-refactor`, and the worktree is usable for autonomous edits.

For ongoing frontend validation after each meaningful patch:

    pnpm run build
    pnpm test

If a patch specifically changes browser-visible UI, also run the repo’s required visual verification workflow before advancing. Where useful, supplement that with targeted Playwright smoke or visual tests.

For the current foundation patch, the minimum proof sequence is:

    pnpm run build
    pnpm test

Then perform visual verification against the shell and command palette and confirm that keyboard access, the sidebar mobile toggle, and the stale-banner shell region still render and behave correctly.

The first verification pass already produced these artifacts:

    docs/archive/shell-foundation-verify-overview.png
    docs/archive/shell-foundation-verify-palette.png
    docs/archive/shell-foundation-verify-mobile.png
    docs/archive/shell-foundation-verify-mobile-drawer-open.png

## Validation and Acceptance

Phase 3 foundation work is accepted when the following are all true:

The frontend still builds and the main test suite still passes. The shell still boots from `frontend/src/main.ts` without breaking route registration or setup gating. The sidebar still preserves expanded state on desktop and still works as a mobile drawer at the existing mobile breakpoint. The command palette still opens with its trigger and keyboard shortcut, still renders grouped items, and still supports arrow-key navigation, enter-to-run, and escape-to-close. Route announcements and the skip link still exist in the DOM. Stale-state messaging remains visible and readable when shown. Light and dark themes still both render coherent shell contrast.

The broader refactor is accepted only when every approved operator-facing surface has been restyled or normalized, shared patterns have been extracted, old duplicated UI code has been removed, and visual verification plus regression checks have been run after the final UI edits.

## Idempotence and Recovery

This plan is intended to be safely repeatable. Reading and re-reading the source files is harmless. Route inventory and design notes can be revalidated at any time. Token cleanup should be performed in additive steps so the UI can still render between patches. If a style refactor breaks rendering, revert only the last patch rather than mixing multiple visual experiments into one recovery step. If visual verification reveals regressions, keep the shared token changes only if they are clearly correct and back out the page-specific or shell-specific styling that caused the regression.

Because setup gating is trust-critical, do not modify the guard behavior in `frontend/src/main.ts` unless a failing test or a concrete operator-facing bug requires it. Because keyboard reachability is trust-critical, do not remove or rename command-palette events, header trigger wiring, or route-announcement hooks without immediately replacing them with an equivalent path.

## Artifacts and Notes

Important current artifacts already established during kickoff:

    Working tree: /home/oruc/Desktop/workspace/risoluto-worktrees/impeccable-full-refactor
    Branch: ui/impeccable-full-refactor
    Missing baseline docs: docs/refactor/STEP1_BASELINE.md, docs/refactor/STEP2_EVALUATION_INVENTORY.md

Key current foundation files:

    frontend/src/main.ts
    frontend/src/router.ts
    frontend/src/ui/shell.ts
    frontend/src/ui/sidebar.ts
    frontend/src/ui/header.ts
    frontend/src/ui/command-palette.ts
    frontend/src/styles/design-system.css
    frontend/src/styles/tokens.css
    frontend/src/styles/primitives.css
    frontend/src/styles/components.css
    frontend/src/styles/shell.css
    frontend/src/styles/shell-responsive.css

Current verification artifacts for the first shell/token pass:

    docs/archive/shell-foundation-verify-overview.png
    docs/archive/shell-foundation-verify-palette.png
    docs/archive/shell-foundation-verify-mobile.png
    docs/archive/shell-foundation-verify-mobile-drawer-open.png

## Interfaces and Dependencies

The current work depends on the existing browser frontend stack already in the repo. No new UI framework should be introduced. Continue using the existing ESM TypeScript frontend, the lightweight in-repo router in `frontend/src/router.ts`, and the `mc-*` style vocabulary from `frontend/src/styles/components.css` and related token files.

At the end of the foundation cleanup milestone, the following interfaces must still exist and behave compatibly:

In `frontend/src/ui/shell.ts`, these exports must remain available:

    export function initShell(root: HTMLElement): { sidebarEl: HTMLElement; headerEl: HTMLElement }
    export function getOutlet(): HTMLElement | null
    export function getRouteAnnouncer(): HTMLElement | null

In `frontend/src/router.ts`, the singleton router must still exist and be imported by the shell and page code:

    export const router = new Router();

In `frontend/src/ui/sidebar.ts`, `frontend/src/ui/header.ts`, and `frontend/src/ui/command-palette.ts`, the initialization functions must still attach the same shell behavior even if their internals are simplified:

    export function initSidebar(sidebarEl: HTMLElement): void
    export function initHeader(headerEl: HTMLElement): void
    export function initCommandPalette(): void

The style layer must keep using the shared CSS token model. New tokens should be added to `frontend/src/styles/tokens.css` unless they are truly part of the lower-level design-system contract in `frontend/src/styles/design-system.css`.

Change note: This plan was created after reconstructing the baseline from committed code because the expected refactor baseline docs were missing. It was updated after the first shell/token cleanup pass to record successful build/test/browser verification and to shift the active work into the next shell/global-primitives cleanup step.
