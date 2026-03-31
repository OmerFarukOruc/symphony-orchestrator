# Context

I maintain **Risoluto** — an autonomous AI agent orchestration platform
that dispatches coding agents (Codex CLI workers) against Linear issues, manages
retries/timeouts, persists attempt history, and serves a real-time dashboard.

# Task

Produce a detailed, structured summary of everything I committed **yesterday**
(the calendar day before today). Save the output as an artifact.

# Instructions

## 1. Identify the Time Window

Use the current local time to determine "yesterday" (midnight-to-midnight in
my local timezone). Do NOT hardcode any date — always derive it dynamically.

## 2. Gather Commit Data

```bash
# All commits from yesterday, chronological
git log --format="%H %ai %s" --since="YYYY-MM-DD 00:00:00" --until="YYYY-MM-DD 00:00:00" --reverse

# Total file stats across the full range
git diff --shortstat <earliest-commit>^..<latest-commit>

# Per-commit stats (files changed, insertions, deletions)
for commit in <each-hash>; do
  echo "=== $(git log --format='%s' -1 $commit) ==="
  git diff --shortstat ${commit}^..${commit}
done
```

## 3. Read Key Diffs

For every commit that touches **>50 lines**, read the actual diff to understand
what changed — don't just rely on the commit message:

```bash
git diff ${commit}^..${commit} --stat
git diff ${commit}^..${commit} -- <interesting-files>
```

Pay attention to:
- **New files** created (new modules, tests, views)
- **Deleted files** (removed features, dead code cleanup)
- **Renamed/moved** files
- **Heavily modified** files (>100 lines changed)

## 4. Categorize & Synthesize

Group commits into logical themes. Common categories (use what fits, skip what doesn't):

| Category | Icon | What to include |
|---|---|---|
| Major Features | 🏗️ | New user-facing capabilities, large architectural additions |
| Design System / Styling | 🎨 | CSS, design tokens, visual overhaul PRs |
| Refactoring | ♻️ | Code reorganization, module extraction, cleanup |
| Bug Fixes | 🐛 | Behavioral fixes, edge-case handling |
| Frontend Utilities | 🛠️ | Shared helpers, new utility modules |
| Copy & Naming | 📝 | UI text changes, label renames |
| Documentation | 📖 | README, guides, operator docs |
| Tests | 🧪 | New test files, expanded coverage |
| CI / Tooling / Chores | 🧹 | CI fixes, linter config, dependency updates |
| Deletions / Removals | 🗑️ | Removed features, dead code purges |

For each category section, include:
- **Summary** of what was done and why it matters
- **File count and line delta** (e.g., *22 files · +630 lines*)
- **Key files** affected (link to them with `file:///absolute/path`)
- For new modules/files: list them with a one-line description

## 5. Output Format

Structure the artifact as:

```markdown
# Daily Recap — {date}

**{N} commits · {N} files changed · +{N} / −{N} lines**

---

## {Icon} {Category Name}

### {Feature/Topic Name}
*{N} files · +{N} / −{N} lines*

{Description of what was done, why, and key files involved.}

---

## 🧪 New Tests Added

| Test File | Coverage |
|---|---|
| `{filename}` | {what it tests} ({N} lines) |

---

## New Modules Created

- [{filename}](file:///absolute/path) — {one-line description}

---

> **TL;DR**: {2-3 sentence executive summary of the day}
```

## 6. Quality Checks

Before finishing, verify:
- [ ] Every commit hash from step 2 is accounted for in a category
- [ ] Line counts per category roughly add up to the total
- [ ] New files and deleted files are explicitly called out
- [ ] No commit is silently dropped — if a commit is trivial (1-2 lines),
      group it with its nearest theme rather than omitting it
- [ ] File links use absolute paths

# Constraints

- **Be thorough** — read diffs, don't just parrot commit messages
- **Be honest** — if a commit is a WIP dump or messy, say so
- **Group intelligently** — merge related commits into one narrative instead
  of listing each commit individually
- **Quantify everything** — every section should have file/line counts
- **Link files** — use `file:///absolute/path` for any file mentioned
- No fluff, no filler — every sentence should carry information
