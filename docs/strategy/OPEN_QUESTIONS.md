# ❓ Open Questions — Deferred Strategic Decisions

> Parked here to keep `VISION.md` sharp. Each question gets three lines: *what*, *why deferred*, *trigger for revisiting*. When a question resolves, replace the entry with a link to the decision (issue, ExecPlan, or VISION edit) and leave the old text struck through.

---

## Q1 — H1 vs H2 architecture hospitality
**What.** How much should H1 (personal autonomous coder) architecture decisions *today* accommodate H2 (multi-tenant / team / non-code) scenarios later? Concretely: auth models, secret scoping, attempt ownership, data plane identity — do we design for one human operator and retrofit later, or design for "a principal" now?
**Why deferred.** Overnight-solo dogfood is not yet running. Designing for hypothetical multi-tenancy before the single-operator flow works is a distraction. But a hard-coded "single operator" assumption baked into ports and persistence would be expensive to unwind.
**Trigger.** When first overnight-solo pilot meets dogfood bar AND an external user asks to run Risoluto on their own tracker. Until both, stay H1-first with ports as the hospitality contract.

## Q2 — Customizable workflow orchestrator: replace or augment?
**What.** The new customizable agent-workflow orchestrator (named in `VISION.md`) — does it *replace* `src/orchestrator/turn-executor.ts` + `src/orchestrator/worker-outcome/*` with a pluggable state machine, or does it sit *above* them as an orchestrator-of-orchestrators (existing turn loop becomes one adapter among many)?
**Why deferred.** The answer depends on which quality pillars (plan-first, fanout, review, per-step criteria) actually land first. Designing the DSL before the use-cases exist is premature generality.
**Trigger.** After first overnight-solo pilot + after the plan-first loop and adversarial reviewer land in whatever form. At that point, concrete phases to compose will exist.

## Q3 — Anvil's future: absorbed or coexistent?
**What.** `anvil-*` skills are already a brainstorm → plan → review → audit → execute → verify factory. Does the overnight orchestrator literally invoke `anvil-risoluto` per issue, or does it borrow patterns while staying separate? If separate, how do we avoid duplication of phase logic?
**Why deferred.** Running anvil per issue overnight hasn't been tried. Anvil was designed for interactive operator-driven work; unattended use may surface friction (e.g., anvil stops for clarification, overnight cannot).
**Trigger.** First overnight pilot attempts using `anvil-risoluto` as the execution engine for one issue. Observed friction points decide coexistence vs absorption.

## Q4 — Self-research loop — when does Risoluto run its own research?
**What.** When does Risoluto graduate to running `risoluto-researcher` on itself overnight — picking a new peer, researching it, proposing spine diffs, filing candidate issues? This is the recursive-self-dev path the operator rejected for *now* but wants open as a future milestone.
**Why deferred.** Requires reliable overnight-solo baseline + a trust bar for the synthesizer skill (not yet designed). Prematurely automating research-to-backlog produces noise.
**Trigger.** After `risoluto-synthesizer` skill ships AND dogfood bar is met AND at least 10 overnight-solo PRs have merged without revert.

## Q5 — Publishing threshold for VISION.md + negative-space summary
**What.** VISION.md and a derived `NEGATIVE_SPACE.md` are drafted for public posture but not yet linked from the outward-facing README as the project identity. What's the behavioral threshold that unlocks publishing them as canonical project identity?
**Why deferred.** Shipping a vision without the dogfood proof is marketing, not substance. Claiming "personal autonomous coder" while the operator hasn't done an overnight-solo run erodes trust.
**Trigger.** First overnight-solo run that produces at least one mergeable PR without operator intervention. At that point, the vision is earned.

## Q6 — wiki-anvil consumption path
**What.** Once `wiki-anvil` ships v1, what exactly moves from Risoluto's local `docs/strategy/` and `research/` into the wiki-anvil retrieval layer — all of it, or only the long-tail / vault-scale corpus?
**Why deferred.** wiki-anvil v1 doesn't exist yet. Designing the migration before the consumer exists is speculative.
**Trigger.** When wiki-anvil v1 ships + offers a retrieval API Risoluto can call. At that point, `MEMORY_WIRING.md` gets an update and the corpus split is decided.

## Q7 — Cost ceiling semantics
**What.** Is the "cost ceiling + kill-switch" (ideas ledger) a hard budget (credits consumed) or a soft budget (attempts tried)? How does the ceiling interact with N-agent fanout — does each fanout attempt have its own slice, or do they share the issue's cap?
**Why deferred.** Depends on pricing model at time of implementation. OpenAI pricing, provider mix, and fanout ratios all move.
**Trigger.** When cost-ceiling implementation starts. Answer will fall out of fanout design.

## Q8 — Alert tier policy mapping
**What.** Which events fall into which tier (silent / morning digest / wake-you)? Is the mapping fixed, operator-tunable, or learned from the operator's historical responses?
**Why deferred.** Premature rules harden the wrong tradeoff. Better to ship fixed defaults and learn.
**Trigger.** After two weeks of overnight runs with the default mapping. At that point, real false-positive / false-negative rates will justify tunability.

## Q9 — Learning-from-failures storage substrate
**What.** Where do "lessons from reverted PRs" physically live — SQLite, research corpus, Obsidian vault via wiki-anvil, or a new ledger? Per-repo, per-module, or per-issue-cluster?
**Why deferred.** Substrate is cheap to change early, expensive to change late. Waiting for the first 10–20 real lessons clarifies the natural granularity.
**Trigger.** After first overnight-solo PR revert. The shape of the revert reason dictates the shape of the lesson.

## Q10 — Synthesizer skill and update-feature-spine overlap
**What.** Both `risoluto-synthesizer` (future) and `update-feature-spine` (existing) touch the same artifacts — `research/INDEX.md`, `research/RISOLUTO_FEATURES.md`, candidate roadmap issues. What is the clean division of labor?
**Why deferred.** The synthesizer doesn't exist yet. Speculating the boundary before its first implementation produces the wrong boundary.
**Trigger.** When synthesizer skill is first designed. Boundary falls out of the inputs + outputs of each skill.
