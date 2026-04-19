# INDEX.md template

`research/INDEX.md` is the master cross-project view. On every skill run it's updated in place — **never rewritten from scratch**.

## Structure

```markdown
# Research Index

> Cross-project feature alignment snapshot. Every row is a target analyzed by the `risoluto-researcher` skill. Rows are updated in place, never destructively rewritten. Per-target detail lives in `<slug>.md` next to this file.

- **Spine file:** `RISOLUTO_FEATURES.md` (maintained manually; this skill reads, never writes)
- **Last run:** YYYY-MM-DD
- **Targets tracked:** <n>

## Legend

| Symbol | Code | Meaning |
|--------|------|---------|
| ⚖️ | `[=]` | Parity |
| 🟢 | `[R+]` | Risoluto stronger |
| 🔴 | `[T+]` | Target stronger |
| ⭐ | `[R!]` | Risoluto-only |
| ✨ | `[NEW]` | Target-novel (not on spine) |
| ❓ | `[?]` | Unclear |

## Targets

| Target | Type | Version | Last run | [=] | [R+] | [T+] | [R!] | [NEW] | [?] | Candidate flags | Notes |
|--------|------|---------|----------|-----|------|------|------|-------|-----|-----------------|-------|
| [symphony](symphony.md) | github-repo | v1.4.0 @ abc1234 | 2026-04-18 | 28 | 6 | 9 | 4 | 11 | 2 | 20 | Elixir reference impl; spec-source |
| [aider](aider.md) | github-repo | v0.54 @ def5678 | 2026-04-18 | 8 | 2 | 4 | 18 | 14 | 3 | 18 | Interactive CLI, not orchestrator — many `[R!]` expected |
| [sweep](sweep-dev.md) | website | fetched 2026-04-18 | 2026-04-18 | 6 | 1 | 8 | 12 | 9 | 7 | 17 | SaaS; website-only analysis, confidence capped |

## Spine sections × targets (matrix view)

For each spine section, which targets are weakest/strongest. Fill on every run.

| Spine section | symphony | aider | sweep | … |
|---------------|----------|-------|-------|---|
| Polling & ingestion | 🟢 4/🔴 2/⭐ 1 | ⭐ 6/❓ 1 | 🔴 3/✨ 2 | … |
| Tracker integration | ⚖️ 5/🔴 1 | ⭐ 5 | 🔴 4/✨ 1 | … |
| Agent runtime | 🔴 3/⚖️ 2/🟢 1 | ⚖️ 2/🔴 4 | ❓ 4/🔴 2 | … |
| PR / CI | ⚖️ 4/🟢 2 | ⭐ 6 | 🔴 5/✨ 3 | … |
| Dashboard / UI | ⭐ 3/🔴 1 | ⭐ 4 | 🔴 6/✨ 2 | … |
| Notifications / alerts | 🟢 3/⚖️ 2 | ⭐ 5 | ⚖️ 3/🔴 1 | … |
| Sandbox / security | 🟢 2/🔴 1 | ⭐ 3 | ❓ 3 | … |
| Persistence / state | 🟢 4 | ⭐ 4 | ❓ 4 | … |
| … | … | … | … | … |

## Negative space — what no target has that Risoluto ships

Features where Risoluto is `[R!]` (no target implements). These are our differentiators as of the last run.

- **Hot-reload workflow config via Chokidar** — no analyzed target reloads config without restart.
- **Cross-platform desktop notifications via one channel adapter** — most targets do Slack only.
- **Signed GitHub + Linear webhooks on a single ingress with replay window** — most targets do one or the other.
- …

## Run history

One row per skill execution.

| Run date | Target(s) updated | Spine SHA | Notes |
|----------|-------------------|-----------|-------|
| 2026-04-18 | symphony (initial), aider (initial), sweep (initial) | abc1234 | First batch for v0.6.0 roadmap planning |
| … | … | … | … |
```

---

## Update rules

The skill must update INDEX.md surgically.

1. **Never rewrite the file whole.** Parse the existing file, find the target's row (or the relevant cell), and update only that. Any other approach risks erasing prior runs' data.

2. **Adding a new target** means:
   - Append a row to `## Targets`.
   - Add a new column to `## Spine sections × targets` under every section row, with the target's per-section code counts.
   - Recompute and append entries to `## Negative space` if the new target's `[R!]` rows intersect with other targets' `[R!]` rows on the same spine item.
   - Append a run to `## Run history`.

3. **Refreshing an existing target** means:
   - Update the target's row in `## Targets` in place.
   - Update the target's column in the matrix in place.
   - Recompute negative space.
   - Append a run to `## Run history`.

4. **Negative space recomputation** must look at intersections: a feature is in negative space only if **every** tracked target has coded it `[R!]`. If even one target has `[=]`, `[R+]`, or `[T+]` for that spine item, remove it from negative space.

5. **Spine section names** come from `RISOLUTO_FEATURES.md`'s top-level section headings. If the spine adds a new section, the matrix gets a new row on the next run. If the spine renames a section, re-key in place rather than duplicating.

6. **No roadmap synthesis here.** Do not aggregate `[T+]` or `[NEW]` items across targets into a top-roadmap table, assign bundles, or draft issues. Cross-target roadmap synthesis is a separate skill that runs once the research corpus is large enough (~10–15 targets). This INDEX is a *data* surface only.

## Anti-patterns to avoid

- ❌ Regenerating `INDEX.md` from only the current target. Prior rows will be lost.
- ❌ Computing totals by summing markdown cells instead of re-reading per-target files. Totals drift.
- ❌ Silently dropping stale targets. If a per-target file no longer exists, leave the row with a `(stale)` marker rather than deleting it.
- ❌ Adding a roadmap / bundle / effort-estimate table here. That synthesis belongs to a later, separate skill that reads the whole corpus at once.
