# 🎯 Risoluto — Vision

> **One north star, no horizons.** If a feature does not serve this vision, it does not ship — or it lives in a fork.

---

## Identity

Risoluto is a **personal autonomous coder** — a self-hosted, single-operator engine that turns a tracker-backed issue queue into **mergeable PRs while the operator sleeps**. Local-first. Sandboxed. No SaaS. No cloud control plane. Your code, your machine, your credentials, your schedule.

This is not "LangChain but better." It is not an agent framework. It is an opinionated pipeline: **tracker → sandboxed agent → PR**, engineered to run unattended for hours and earn the operator's trust through quality and reliability, not through breadth of configuration.

## Dogfood Bar — The Whole Project Is Judged Against This

> File N issues in bulk. Go to sleep. Wake up to PRs ready for morning review.

Every architecture decision, every new feature, every bundle of roadmap work is evaluated by a single question: **does this make the overnight-solo run more likely to succeed?** "Mergeable morning-after" is the quality bar. Reliability beats breadth. A working pipeline that handles ten issues is worth more than a rich pipeline that handles none.

Dogfooding is not a credibility story. It is the operating test.

## Two-Horizon Scope

**Primary horizon.** Personal autonomous coder, overnight-solo, dogfood-driven. This is what Risoluto *is* today and for the foreseeable future. All architecture decisions must serve this first.

**Eventually in scope (not now).** Multi-tenant / team use and adjacent non-code agent work. Keep design doors open — don't build for them, but don't hard-block them either. Concretely:

- Ports (`TrackerPort`, `AttemptStorePort`, `SecretsPort`, etc.) stay the contract surface — extend, don't bypass.
- Auth / secrets / persistence choices should not assume a single human operator is the only possible principal.
- Pricing, billing, and org models are explicitly off-limits; architecture hospitality is all that's owed to H2.

When H1's dogfood bar is met, H2 becomes a real conversation. Until then, H2 is just air cover.

## Explicitly Rejected

These are not "not yet." They are "not."

- **Generic agent framework.** We are not building a general-purpose agent substrate. Risoluto is a coding pipeline with opinions. Pluggable harnesses and adapters are fine; "build your own agent workflow in our DSL for any purpose" is not the goal.
- **Web IDE / in-browser code editor.** The operator uses their real IDE. Risoluto does not ship a Monaco pane, a VS Code clone, or inline code editing in the dashboard. The dashboard observes and steers; it does not replace the editor.

## Quality Pillars

Each of these is an intent, not a design. Deep architecture work for each lives in its own ExecPlan.

- **Spec-first issue shaping.** Before dispatch, an interviewer phase hardens vague issues into crisp specs with acceptance criteria. Bad issues are sharpened — not rubber-stamped — before they reach the coder.
- **Context packing pre-flight.** Agents start with a grounding brief: related past PRs, adjacent code, prior attempts on the same issue, repo conventions. Cold-start context blindness is a bug, not a given.
- **Plan-first loop.** The agent produces a reviewable ExecPlan before writing code. The plan is gated by a reviewer pass. Vibe-coding from issue text is not a valid path.
- **N-agent fanout + auto-grading.** Launch multiple attempts per issue, auto-grade outcomes (tests, reviewer agent, LLM-as-judge), keep the winner. Quality through redundancy.
- **Per-step success criteria.** Each step has pass/fail gates — tests green, types clean, visual diff, custom rules. The agent cannot self-declare DONE.
- **Visual + e2e verification loop.** UI changes round-trip through the browser. Backend changes round-trip through the real endpoint. CLAUDE.md principle #4 is enforced machine-side, not trust-based.
- **Adversarial reviewer agent.** A separate hostile-reviewer pass reads every diff before merge-readiness is declared. LGTM is something the system earns, not something the coder grants itself.
- **Learning from past failures.** Reverted PRs, iterated-heavily PRs, and rejected attempts become lessons that auto-load into future attempts in the same area. The system compounds.

## Reliability Pillars

The overnight-solo promise is only real if the system survives an eight-hour unattended run.

- **Preflight doctor + self-heal.** On startup and on a cadence, check Docker, disk, credentials, webhook health, rate-limit headroom, Codex auth. Fix what can be fixed; park work safely when it can't.
- **Attempt compounding + checkpoints.** Failed or stalled attempts resume with compacted context, not cold restart. Attempt N+1 sees attempt N's progress, learnings, and dead-ends.
- **Cost ceiling + kill-switch.** Hard per-issue / per-run / per-night budget caps. A single runaway issue cannot burn the month's budget overnight.
- **Multi-provider failover.** When one provider rate-limits or goes down, work routes to the next. The queue keeps moving instead of stalling for hours.
- **Queue-aware sequencing.** Order the overnight queue by dependencies first, cheap wins next, hairy/risky last. If the night ends early, the operator still ships value.
- **Partial-completion safety net.** A run that times out mid-change commits to a WIP branch with a paused PR. Morning-operator sees exactly where night-Risoluto got stuck, never a zero.
- **Alert tier + wake-you policy.** Merge-ready = silent. Blocker = morning digest. Runaway cost / host down = wake operator at 3am. The alert engine exists; the policy mapping is the design work.

## Future Primitives — Named, Not Designed

These are strategic intents with no architecture committed. Each will earn its own ExecPlan when the first overnight-solo pilot surfaces real requirements.

- **Customizable agent-workflow orchestrator.** A pluggable state-machine layer where operators (or issue classes) define their own pipelines — `plan → code → review → ship`, `plan → fanout → grade → merge`, or anything else. Adapter-shaped, not monolithic. Replaces or augments `turn-executor.ts` + `worker-outcome/*` — to be decided.
- **Research synthesizer skill.** Reads the research corpus (`risoluto-researcher` ledgers + spine) and emits implementation bundles grouped by **user-story arcs** — "I can fan out an issue and pick the best result" — not by code seams, peer-gaps, or risk tiers. Complements `update-feature-spine`.

## Public Posture

- **Core repo.** MIT, public, single-operator-optimized. Community contributions welcome; the quality bar is the dogfood test.
- **Research submodule.** Private by default. The raw peer-by-peer analyses are the operator's competitive intel.
- **Research output that publishes.** `research/INDEX.md` (target list + alignment matrix) and a public `NEGATIVE_SPACE.md` summary (what Risoluto ships that peers don't). Enough for contributors to see what was benchmarked against; not enough to expose every behavioral delta.

## What This Vision Is Not

This is not a roadmap. This is not a spec. This is not a timeline. Roadmap lives in `docs/ROADMAP_AND_STATUS.md`. Spec conformance lives in `docs/CONFORMANCE_AUDIT.md`. Scattered operator ideas live in `docs/strategy/IDEAS.md`. Deferred strategic questions live in `docs/strategy/OPEN_QUESTIONS.md`.

The vision sits above all of them and is the single filter that decides whether any of them are still pointed in the right direction.
