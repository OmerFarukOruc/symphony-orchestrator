# 🧠 Memory Wiring — How Claude Code Loads Risoluto Context

> Three tiers, each with a different cost / relevance tradeoff. **This document describes the design, not the implementation.** No qmd indexing is running yet, no skill code changes are implied. When a tier becomes real, link the commit / ExecPlan here.

---

## Problem

A fresh Claude Code session in this repo starts without knowing: what Risoluto is building toward (vision), what ideas are in-flight (ideas ledger), which peer projects have been benchmarked (research corpus), or how the operator decided current tradeoffs (open questions, past sessions). Without this, every session re-asks the same questions and re-discovers the same constraints. The memory wiring exists to feed the session enough to avoid that loop — without blowing the context budget.

## Three-Tier Architecture

### Tier 1 — Static (always loaded via CLAUDE.md)

Small, human-readable, high-signal. These sit in every Claude Code session automatically because `CLAUDE.md` references them as mandatory context.

| File | What it provides |
|------|-----------------|
| `docs/strategy/VISION.md` | North star, dogfood bar, rejected scope, quality + reliability pillars. |
| `docs/strategy/IDEAS.md` | Operator ideas ledger — PR quality, reliability, future primitives. |
| `docs/strategy/OPEN_QUESTIONS.md` | Deferred strategic questions so sessions know what's unresolved. |
| `research/INDEX.md` | Private submodule — per-target alignment matrix + negative space. |
| `research/RISOLUTO_FEATURES.md` | Canonical feature spine (manually maintained). |
| `docs/ROADMAP_AND_STATUS.md` | Reconciled roadmap state + bundle counts. Source of truth for "what's open." |

**Budget rule.** Each Tier-1 file stays under ~300 lines of meaningful content. If a doc grows past that, split it — do not let Tier-1 become a context-eating monolith.

### Tier 2 — On-demand via skills

Skills surface deep slices of context only when the session actively needs them. They do not preload.

| Skill | When invoked |
|-------|--------------|
| `risoluto-researcher` | Deep-dive one peer project. Produces `research/<slug>.md`. |
| `update-feature-spine` | Reconcile `RISOLUTO_FEATURES.md` after a merged PR. |
| `risoluto-synthesizer` *(future)* | Turn research corpus into user-story implementation bundles. |
| `risoluto-logs` | Inspect archived attempt / runtime state. |
| `surface-harvest-qa` | Desktop-only surface discovery and QA pass. |
| `anvil-*` | Interactive brainstorm → plan → review → audit → execute → verify factory for larger work. |
| `visual-verify` | Mandatory after UI changes; triggers a real browser round-trip. |

A skill's cost is paid only when the skill runs. Most sessions never invoke most skills — Tier 2 is deliberately lazy.

### Tier 3 — Semantic search via qmd *(future)*

When the research corpus hits broad + shallow scale (~20–30 targets), grepping and manual recall stop scaling. Semantic search fills the gap.

**Planned flow.**

1. Run `qmd embed` over `research/`, `docs/`, and eventually the operator's Obsidian vault.
2. Claude Code sessions use the `qmd` MCP `query` tool with lex + vec blend when they need "has any peer solved X" or "what did we decide about Y in the docs."
3. The query returns file paths + snippets, not full-doc context dumps. Session pulls the full doc only if the snippet is insufficient.

**Replaces.** Ad-hoc grep through 20+ research targets. Mental recall of "I think I read this before, somewhere."

**Does not replace.** Tier 1 — small human-readable docs stay loaded automatically. Tier 3 is for the long tail.

**Not done yet.** No qmd index exists for this repo. When it does, the qmd MCP status in a fresh session should report a non-zero document count. That's the readiness check.

## wiki-anvil Relationship

`/home/oruc/Desktop/workspace/wiki-anvil/` is a separate project being built by the same operator — a general-purpose LLM-wiki grounded in Obsidian. The relationship to Risoluto is **consume-later**, not co-build:

- **Today.** Risoluto uses local files (Tiers 1–3 above) with no dependency on wiki-anvil. `wiki-anvil` is not a runtime requirement. Research stays in `research/` (private submodule).
- **After wiki-anvil v1 ships.** Risoluto becomes one of its consumers. The operator's Obsidian vault + wiki-anvil retrieval layer replaces Tier 3 for vault-scale memory. Tier 1 stays local (vision / ideas / feature spine live in the repo, not the vault).
- **Never.** Shared runtime, shared index, shared auth. If wiki-anvil is unavailable, Risoluto must degrade to Tiers 1–2 with no functional loss for the core overnight-solo flow.

This isolation is intentional — two projects co-evolving without coupling their release cycles.

## Research Corpus Cadence

Target corpus size: **~20–30 peer projects** (broad + shallow, not deep + few). First pass per target is one-shot via `risoluto-researcher`. Re-runs are opportunistic — triggered by a peer shipping a major release, or when the corpus is used as synthesizer input.

**Public posture of the corpus.**
- `research/<slug>.md` ledgers — **private.** Operator-only intel.
- `research/INDEX.md` — **publishable summary.** Target list, alignment matrix, negative-space rollup.
- `research/RISOLUTO_FEATURES.md` (feature spine) — publishable; operator-authored.
- Future `research/NEGATIVE_SPACE.md` — publishable standalone summary of Risoluto-only features.

The distinction: *what* Risoluto is compared against is public, *how deep each comparison went* stays private.

## Session-Start Checklist *(what Claude Code should see)*

A fresh session in this repo, on opening its first message, should already have in context:

- [x] `CLAUDE.md` (loaded automatically)
- [x] `docs/strategy/VISION.md` (via CLAUDE.md Strategy Context block)
- [x] `docs/strategy/IDEAS.md` (via CLAUDE.md Strategy Context block)
- [x] `docs/strategy/OPEN_QUESTIONS.md` (via CLAUDE.md Strategy Context block)
- [ ] `research/INDEX.md` (via CLAUDE.md Strategy Context block — submodule must be initialized)
- [ ] `research/RISOLUTO_FEATURES.md` (same)
- [x] `docs/ROADMAP_AND_STATUS.md` (already referenced in CLAUDE.md's Docs to Keep Truthful)

Unchecked items depend on the private submodule being initialized (`git submodule update --init research`). When the submodule is not present, Tier 1 gracefully reduces to in-repo docs; the session prompt should not fail.

## Evolution Rules

- Tier 1 files are the slowest-changing. Changes get their own PR, not a "while I'm here" edit.
- When a Tier 2 skill stops being invoked in real sessions for a month, question its value.
- Tier 3 is the most likely to drift — index freshness matters. When it's real, add a cadence check to `risoluto doctor`.
- A new file is never added to Tier 1 without removing or shrinking another Tier 1 file. The budget is real.
