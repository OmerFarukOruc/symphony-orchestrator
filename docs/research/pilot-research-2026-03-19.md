# Research Summary: alekspetrov/pilot

**Date:** 2026-03-19
**Repo:** [alekspetrov/pilot](https://github.com/alekspetrov/pilot) (190 stars, Go, BSL 1.1)
**Research scope:** README, CLAUDE.md, config, Dockerfile, Makefile, CONTRIBUTING.md, go.mod

---

## Repository Overview

Pilot is an autonomous AI development pipeline written in Go that:

- Receives tickets from GitHub, GitLab, Azure DevOps, Linear, Jira, Asana, Plane
- Plans implementation using Claude Code (or OpenCode)
- Writes code, runs tests, opens PRs
- Supports dev/stage/prod autopilot modes with CI monitoring and auto-merge
- Has a Bubble Tea TUI dashboard, SQLite persistence, and Telegram bot with voice/image support

---

## Key Findings (Grouped by Theme)

### Execution & Orchestration

- **Scope-aware execution mode**: Auto-detects file overlap between issues; runs non-overlapping tasks in parallel, serializes overlapping ones. Reduces merge conflicts without manual mode selection.
- **Smart retry**: Error-category-specific backoff (rate_limit: 30s exponential, api_error: 5s, timeout: 1.5x extension, invalid_config: fail fast). Much more nuanced than uniform retry.
- **Stagnation loop detection**: Tracks last N execution states, detects consecutive identical states (threshold configurable), escalates warn → pause → abort with partial work commit.
- **Execution replay**: Full record/playback/analyze/export of attempt histories as HTML/JSON/Markdown.

### Autopilot & CI

- **Three autopilot environments**: dev (skip CI, auto-merge), stage (wait CI, auto-merge), prod (wait CI + human approval). Each with independent branch, timeout, and post-merge config.
- **CI check discovery**: Auto-mode discovers CI checks with configurable exclusion patterns and grace period.
- **Self-review before PR**: Agent reviews its own diff before pushing.

### Intelligence & Memory

- **Cross-project pattern learning**: SQLite-backed, confidence-scored patterns injected into agent prompts. Anti-pattern support.
- **Effort routing**: Maps task complexity to Claude thinking depth (low/medium/high/max).
- **Model routing**: Trivial → Haiku, Simple → Sonnet, Complex → Opus. Auto-detected.
- **Epic decomposition**: Complex tasks auto-split into sequential subtasks with PR wiring.

### Integration & Chat

- **Multimodal Telegram**: Voice message transcription (OpenAI Whisper), image handling, 5 interaction modes (Chat, Question, Research, Planning, Task).
- **Config-driven adapters**: YAML-based adapter system for Telegram, GitHub, GitLab, Azure DevOps, Linear, Jira, Slack, Discord, Plane.
- **Daily briefs**: Scheduled reports via Slack/Telegram/email with metrics summary and error highlights.

### Operations

- **Hot upgrade**: Self-update with `pilot upgrade`, rollback on health check failure, dashboard keyboard shortcut (`u`).
- **Persistent metrics via SQLite**: Token usage, cost, task counts survive restarts.
- **Budget controls**: Hard enforcement with configurable caps.
- **Docker Compose deployment**: Health check endpoints, persistent volumes.
- **BYOK**: Bring your own Anthropic key, Bedrock, or Vertex AI.

### Desktop & TUI

- **Wails v2 desktop app**: Native macOS/Windows/Linux desktop with embedded dashboard.
- **Bubble Tea TUI**: Sparkline metrics cards, queue depth, autopilot status, keyboard navigation.
- **Embedded React dashboard**: Build with `make build-with-dashboard` for gateway embedding.

### Developer Experience

- **Navigator integration**: `.agent/` directory for planning context, `/nav-task` command for design-first workflow.
- **Chaos tests**: Fault injection test suite for resilience validation.
- **Secret pattern detection**: Pre-commit hooks block realistic API keys in test files.
- **Conventional commits**: Enforced format with scope reference to task IDs.

---

## Items Added to Epic (New Issues)

| Issue                                                                   | Title                                            | Tier | Rationale                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#94](https://github.com/OmerFarukOruc/symphony-orchestrator/issues/94) | Scope-aware execution mode auto-switching        | T2   | Pilot's `auto` mode is a practical improvement over manual sequential/parallel selection. Symphony can analyze workspace scope before dispatch.                                |
| [#95](https://github.com/OmerFarukOruc/symphony-orchestrator/issues/95) | Smart retry with error-category-specific backoff | T2   | Pilot's per-category retry strategies (rate_limit, api_error, timeout, invalid_config) are more resilient than uniform retry. Directly applicable to Symphony's retry manager. |
| [#96](https://github.com/OmerFarukOruc/symphony-orchestrator/issues/96) | Hot upgrade / self-update                        | T3   | Pilot's `pilot upgrade` with rollback and health-check validation reduces operational friction for long-lived daemon deployments.                                              |

---

## Items Enriched in Epic (What Was Added)

| Issue | Enrichment                                                                       | Source                     |
| ----- | -------------------------------------------------------------------------------- | -------------------------- |
| #14   | Hard budget enforcement: per-day/per-issue caps with 80%/100% operator alerts    | pilot cost controls        |
| #20   | YAML-based adapter config for swappable input sources                            | pilot adapter architecture |
| #23   | OpenCode backend support alongside Claude Code                                   | pilot dual executor        |
| #25   | Pre-push self-review stage before PR creation                                    | pilot self-review          |
| #27   | Execution replay with playback, analysis, HTML/JSON/MD export                    | pilot replay system        |
| #30   | SQLite-backed cross-project pattern learning with confidence scoring             | pilot memory system        |
| #37   | Environment-based autopilot progression: dev/stage/prod with independent configs | pilot autopilot modes      |
| #52   | SQLite-backed persistent metrics for historical trends                           | pilot SQLite metrics       |
| #56   | Docker Compose deployment template with health checks                            | pilot deployment           |
| #57   | Stagnation loop detection via state history tracking                             | pilot stagnation detection |
| #66   | Multimodal support: voice transcription, image handling                          | pilot Telegram bot         |
| #67   | Daily brief templates via Slack/Telegram/email                                   | pilot brief system         |
| #77   | Sub-issue PR wiring for aggregate parent tracking                                | pilot epic decomposition   |

---

## Items Deliberately Skipped

| Pilot Feature                          | Why Skipped                                                                                                                           | Consider Later?         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Bubble Tea TUI**                     | Symphony already has #21 (TUI view) with Bubble Tea architecture from Orchestra. Pilot confirms the pattern but adds nothing new.     | No                      |
| **Navigator `.agent/` directory**      | Symphony already uses WORKFLOW.md for agent context. Pilot's approach is similar but less suited to Symphony's Linear-first workflow. | No                      |
| **GitLab/Azure DevOps/Plane adapters** | Out of scope — Symphony is Linear-first. These would only matter if Symphony adds multi-tracker support beyond GitHub (#11).          | If multi-tracker needed |
| **Discord adapter**                    | Covered by #66 (chat integration layer). Pilot's Discord support confirms the pattern.                                                | No                      |
| **Desktop app (Wails v2)**             | Symphony already has #53 (Tauri desktop). Different framework, same goal. No value-add.                                               | No                      |
| **Chaos/fault injection tests**        | Testing practice, not a feature. Worth adopting internally but doesn't belong in the feature roadmap.                                 | Adopt internally        |
| **Secret pattern detection hooks**     | Development tooling, not a feature. Worth adopting as a repo convention.                                                              | Adopt internally        |
| **Effort routing**                     | Covered by model routing (#23). Pilot separates effort and model routing, but Symphony can fold effort into model config.             | No                      |
| **Rich PR comments**                   | Enriched into #59 rather than standalone. Pilot confirms the pattern is valuable.                                                     | No                      |

---

## Summary

**3 new issues created**, **13 existing issues enriched** with Pilot-inspired details.

Pilot's strongest contributions to Symphony's roadmap:

1. **Scope-aware dispatch** — solves the parallel-vs-sequential tension without operator tuning
2. **Smart retry** — practical improvement over uniform backoff, especially for rate-limit handling
3. **Autopilot environments** — dev/stage/prod progression is a proven pattern for safe autonomy
4. **Stagnation loop detection** — state history tracking catches a class of bugs that pure timeout-based stall detection misses
5. **Cross-project pattern learning** — concrete SQLite implementation for the vector memory vision (#30)

Pilot confirms many of Symphony's existing roadmap choices (TUI, plugin architecture, multi-provider, chat integration) while introducing concrete implementation patterns that can accelerate delivery.
