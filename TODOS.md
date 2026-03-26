# TODOS

Items deferred from reviews. Each has context for someone picking it up later.

## Post-Migration

### Storybook Component Playground
**What:** Set up Storybook for the React component library in `packages/web/`.
**Why:** Visual documentation of all UI components makes contributor onboarding faster and design review easier. Also serves as a living style guide.
**Effort:** M (human: 1 week / CC: 20 min)
**Priority:** P3
**Depends on:** Phase 9 (React scaffold) complete.

### Announcement Toolkit
**What:** README template with hero GIF, feature grid, and one-liner install. Script to record demo GIF automatically (headless browser → screen capture → optimize).
**Why:** The announcement is only as good as the README. A polished README with a compelling GIF is the single highest-ROI artifact for open-source adoption.
**Effort:** S (human: 2 days / CC: 15 min)
**Priority:** P2
**Depends on:** Phase 15 (demo mode) complete (the GIF records the demo).

### SSE Delta Updates
**What:** Instead of pushing full `RuntimeSnapshot` on every state change, push only the changed fields (delta). TanStack Query merges the delta into the cached snapshot.
**Why:** Full snapshot push on every event causes unnecessary re-renders across all subscribed components. For a local tool with 1-2 tabs this is fine, but it becomes noticeable with many running agents or frequent events.
**Effort:** M (human: 1 week / CC: 20 min)
**Priority:** P3
**Depends on:** Phase 6 (SSE) and Phase 9 (React + TanStack Query) complete.

### i18n-Ready Copy Foundation
**What:** Extract all user-facing strings into a centralized copy file. Use a lightweight i18n library (or just named constants) so translations can be added later without touching component code.
**Why:** Forward-thinking for international adoption. Easier to do before there are 40+ components with hardcoded strings.
**Effort:** S (human: 2 days / CC: 15 min)
**Priority:** P3
**Depends on:** Phase 9 (React scaffold) complete.
