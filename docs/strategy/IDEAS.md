# 💡 Risoluto — Ideas Ledger

> **Not a roadmap.** A structured dump of operator ideas for the overnight-solo dogfood bar. Each entry captures *what*, *why it matters for overnight-solo*, and *what's unresolved*. Triage and sequencing happen later, in their own ExecPlan.

Every item here was extracted directly from operator interviews. Nothing is invented. When an item graduates into a roadmap issue, link the issue number in place and leave the entry here as the origin record.

---

## PR Quality

### Spec-first issue shaping
**What.** Before an issue is dispatched to a coder, an interviewer agent rewrites it into a crisp spec with acceptance criteria. If the issue is underspecified, the interviewer asks clarifying questions asynchronously (Linear comment, Slack, email) and waits for the operator's reply before dispatch.
**Why for overnight-solo.** Vague issues are the #1 source of "finished but wrong" PRs. Hardening the spec up front is cheaper than rejecting a full PR and re-running.
**Unresolved.** Does the interviewer block dispatch, or does it run alongside and override mid-stream? How does it reconcile with `anvil-brainstorm`'s existing interview pattern — reuse or adapt?

### Context packing pre-flight
**What.** Before the coding agent starts, a pre-flight phase packs a grounding brief into the first prompt: related past PRs, adjacent code, prior attempts on the same issue, relevant conventions, recent changes near the target files.
**Why for overnight-solo.** Cold-start context blindness is measurable in PR quality. A cheap up-front read is worth a round of revisions avoided.
**Unresolved.** How is relevance scored? Static (file-path heuristics) or embedded (qmd over the repo)? Where does the budget cut off?

### Plan-first loop
**What.** The agent must produce a reviewable ExecPlan (matching `.agents/PLANS.md`) before it touches code. The plan is reviewed by a plan-review pass and either approved, revised, or rejected.
**Why for overnight-solo.** A bad plan silently produces a bad PR. Reviewing the plan is 10x cheaper than reviewing the diff.
**Unresolved.** What does "plan rejected" do — re-interview the issue, escalate to the operator, or move to the next issue?

### N-agent fanout + grade
**What.** Launch N attempts per issue with different strategies (different models, different plans, different prompts). Auto-grade outcomes via tests + reviewer agent + LLM-as-judge. Keep the winner, archive the rest for learning corpus.
**Why for overnight-solo.** Cost is no object. Quality through redundancy beats quality through hoping one attempt lands. Issue #366 is the primitive.
**Unresolved.** Fanout strategy — same model different prompts, or different models? How does grading handle ties or all-failing? What's the budget cap per fanout?

### Per-step success criteria
**What.** Every step has measurable pass/fail gates: tests green, types clean, lint clean, visual diff passes, custom rules (e.g., "API route must have OpenAPI coverage"). Agent cannot self-declare DONE until all gates pass. Issue #369 is the primitive.
**Why for overnight-solo.** Removes the "it compiled so it's done" failure mode. Gates the ceremony of DONE behind observable evidence.
**Unresolved.** Who authors the custom rules — operator, Risoluto config, issue body, or the reviewer agent? How is rule drift avoided?

### Visual + e2e verification loop
**What.** For UI changes, agent must round-trip through `/visual-verify` + Playwright and read the output before declaring DONE. For backend, agent calls the real endpoint. Enforces CLAUDE.md principle #4 (goal-driven execution) machine-side.
**Why for overnight-solo.** Most "finished" PRs today are finished by test-green, not feature-green. The browser / endpoint is the ground truth.
**Unresolved.** For overnight runs with no operator eyes, how does visual regression triage ambiguous diffs (e.g., a font-rendering shift)? Can a reviewer agent adjudicate?

### Adversarial reviewer agent
**What.** A separate hostile-intent reviewer agent reads the diff, looking for bugs, missing tests, scope creep, unintended coupling, fragility, and security regressions. Either LGTMs or returns the attempt for revision. Pattern exists in `ce-adversarial-reviewer` and `plan-review` skills.
**Why for overnight-solo.** The operator won't catch subtle regressions at 7am with coffee. Adversarial review shifts that catch to 3am, before merge.
**Unresolved.** How many rounds of reviewer ping-pong before the attempt is escalated to the operator? Does the reviewer see the plan, or just the diff?

### Learning from past failures
**What.** Reverted PRs, heavily-iterated PRs, and rejected attempts become structured lessons. Lessons auto-load into future attempts in the same area (per-repo, per-module, per-issue-cluster). The system compounds over weeks.
**Why for overnight-solo.** Without compounding, every overnight run starts from zero. With it, the system gets sharper while the operator sleeps.
**Unresolved.** Storage substrate — local SQLite, research corpus, Obsidian vault via wiki-anvil? Lesson format — prose, rule, signature-based match? Who writes the lesson — the reviewer agent, a post-merge reflection agent, or the operator?

---

## Reliability & Overnight Safety

### Preflight doctor + self-heal
**What.** Issue #367 `risoluto doctor` runs on startup and on a cadence: Docker, disk, credentials, webhook health, rate-limit headroom, Codex auth. Can self-heal common issues (restart container, refresh token, rotate stuck worker) or park work safely and alert.
**Why for overnight-solo.** An eight-hour unattended run must survive transient failures. Self-healing is the difference between "three PRs" and "zero PRs because docker daemon restarted at 2am."
**Unresolved.** Which failures are safe to self-heal vs escalate? Is the doctor a standalone subsystem or an orchestrator capability?

### Attempt compounding + checkpoints
**What.** Every attempt writes rich checkpoints. A failed or stalled attempt RESUMES with compacted context instead of restarting cold. Attempt N+1 sees attempt N's progress, learnings, and dead-ends. Issue #375 (shipped) is the primitive; compounding is the behavior on top.
**Why for overnight-solo.** Lost work is the worst outcome — the operator burned credits and has nothing to review. Compounding guarantees every attempt pays forward.
**Unresolved.** What's "compacted context" exactly — summary, diff, last-N turns, embedding-retrieved facts? Who decides when to restart vs resume?

### Cost ceiling + kill-switch
**What.** Hard per-issue, per-run, and per-night budget caps in dollars. If a single issue burns past 20x the mean, pause it and flag. If the night-total crosses the cap, stop dispatch. Kill-switch can be triggered manually.
**Why for overnight-solo.** A single runaway issue cannot eat the month's OpenAI budget overnight. This is the "don't burn the house down" safety primitive.
**Unresolved.** Granularity — per-model? Per-attempt-in-fanout? How is the kill-switch propagated to in-flight workers without orphaning?

### Multi-provider failover
**What.** When OpenAI rate-limits or goes down, auto-retry with Anthropic / local model / proxy provider. Queue keeps flowing instead of stalling for hours. Requires multi-harness, adjacent to Scion's model.
**Why for overnight-solo.** One-provider outages are predictable and can eat an entire overnight window. Failover restores the promise.
**Unresolved.** Harness parity — can an Anthropic agent pick up a half-finished Codex attempt? Is failover per-issue or per-turn?

### Queue-aware issue sequencing
**What.** Order the overnight queue by: dependencies first (#276 blocker primitive), cheap/fast wins next, hairy/risky last. Operator-tunable weights. If night ends early, the queue shipped the most value it could.
**Why for overnight-solo.** A dumb FIFO queue ships zero value when the first issue is the hardest. Smart sequencing hedges against running out of time.
**Unresolved.** How is "cheap" estimated — historical attempt cost, issue size, agent-supplied estimate? How does the sequencer react when a high-priority issue jumps in mid-run?

### Partial-completion safety net
**What.** A run that times out mid-change commits progress to a branch with a WIP / paused PR rather than discarding. Morning-operator sees exactly where night-Risoluto got stuck. Shipped primitive #319 (pre-cleanup auto-commit) already covers part of this.
**Why for overnight-solo.** Zero outcomes are worse than partial ones. Partial PRs are real artifacts the operator can finish in five minutes instead of relaunching.
**Unresolved.** How is the WIP PR distinguished from a real PR in the dashboard / GitHub? How does the morning resume flow work — a new attempt that picks up the branch, or a manual hand-off?

### Alert tier + wake-you policy
**What.** Classify events into tiers. Merge-ready PR = silent. Blocker = morning digest. Runaway cost / host down / credential revoked = wake operator at 3am via Slack + desktop. Alert engine exists (shipped #282); the policy mapping is the design work.
**Why for overnight-solo.** Over-alerting trains the operator to ignore alerts. Under-alerting means a 5am-discovered catastrophe. Tiering is the trust contract.
**Unresolved.** Tier definitions — fixed or operator-tunable? What about graceful degradation (e.g., two providers out, only one left)?

### Adaptive concurrency + backpressure *(not selected, kept as note)*
**What.** Auto-throttle concurrent agents based on rate-limit remaining, disk pressure, CPU load, context-window pressure. Don't burn credits into a wall — queue and resume.
**Why this note exists.** Omer skipped this option when the reliability menu was offered. Capturing it here anyway because it's the exact counterpart to cost-ceiling + kill-switch — both are safety primitives, but cost-ceiling is a hard cap while backpressure is soft throttling. The fact that it wasn't picked is the signal: overnight-solo with unlimited credits doesn't need soft throttling, just hard caps. If the stance changes, this entry is the starting point.

---

## Future Primitives (Named, Not Designed)

### Customizable agent-workflow orchestrator
**What.** A pluggable state-machine layer where operators (or issue classes) define their own pipelines. `plan → code → review → ship`, `plan → fanout → grade → merge`, `interview → spec → plan → fanout → grade → visual-verify → review → ship` — all expressible. Adapter-shaped, customizable, not monolithic.
**Why for overnight-solo.** Different issue types want different pipelines. A one-line typo fix doesn't need the full fanout+review ceremony; a data-migration PR absolutely does. Hardcoded pipelines force the wrong tradeoff.
**Unresolved — all of it.** Replaces or augments `turn-executor.ts` + `worker-outcome/*`? YAML-defined phases, TypeScript DSL, or skill-composed? How does it interact with the existing `anvil-*` factory? Full design deferred to its own ExecPlan.

### Research synthesizer skill → user-story bundles
**What.** New skill that consumes the research corpus (every `research/<slug>.md` ledger + the feature spine) and emits implementation bundles grouped by **user-story arcs** — "I can fan out an issue to 3 models and pick the best" — not by code seams, peer-gaps, or risk tiers.
**Why for overnight-solo.** As the corpus grows to 20–30 targets, the operator cannot manually triage every [T+] / [NEW] into a coherent implementation slice. The synthesizer bridges intel to buildable backlog.
**Unresolved.** How does it overlap with `update-feature-spine`? Does it file GitHub issues or just propose a markdown bundle? How does it avoid hallucinated bundles?

### qmd embeddings over research/ + docs/ + vault
**What.** Run `qmd embed` over `research/`, `docs/`, and eventually the operator's Obsidian vault. Claude Code uses `qmd` MCP `query` with lex+vec blend to surface relevant past intel per turn.
**Why for overnight-solo.** At corpus scale (20–30 peers), grepping is the wrong primitive. Semantic retrieval restores per-turn context freshness.
**Unresolved.** Indexing cadence — on-commit, nightly, manual? Where does the index live — per-repo, per-operator, shared with wiki-anvil? Redaction — do we index secrets-adjacent config? See `MEMORY_WIRING.md` Tier 3.

### wiki-anvil as the eventual memory substrate (post-v1)
**What.** Once `wiki-anvil` ships v1 (see `/home/oruc/Desktop/workspace/wiki-anvil/`), Risoluto becomes one of its consumers. Operator memory lives in the Obsidian vault via wiki-anvil's retrieval layer. Risoluto's local `research/` + `docs/strategy/` become a wiki-anvil-indexed corpus.
**Why for overnight-solo.** Compounds the operator's personal knowledge with the project's research corpus. The coder agent can retrieve from both without the operator having to stitch them.
**Unresolved.** Coupling cost — Risoluto today is self-contained; wiki-anvil dependency changes that. Graceful-degradation story when wiki-anvil isn't running. See `OPEN_QUESTIONS.md`.
