---
date: 2026-04-01
topic: v1-roadmap-assessment
---

# Risoluto v1.0 Roadmap Assessment

## Problem Frame

Risoluto is at v0.6.0 with 238/239 spec conformance, 223 test files, and a production-grade core. The goal is to reach **v1.0 as a feature-complete orchestration platform** — not just a working prototype, but a system other developers can adopt as their primary AI agent orchestrator. Three feature pillars plus a hardening pass must ship before v1.0.

The legacy roadmap (issue #9) is archived. This document defines the fresh v1.0 scope based on the current codebase assessment and Omer's intent.

## Current State Assessment

### What's Strong (v0.6.0 baseline)

| Area | Assessment | Detail |
|------|-----------|--------|
| Architecture | **Excellent** | Port pattern, dirty-tracking collections, event bus — clean module boundaries, no circular deps |
| Webhook security | **Excellent** | Timing-safe HMAC, dual-rotation, replay window, write guards |
| Persistence | **Excellent** | SQLite with CHECK constraints, WAL mode, FK enforcement, auto-migration |
| Audit logging | **Excellent** | Full mutation trail with redacted secrets, query API |
| Testing | **Very good** | 223 files, property-based tests, Playwright E2E, integration suite |
| Config management | **Very good** | Layered overlay, dynamic reload, validation on refresh, rollback-on-error |
| Spec conformance | **Very good** | 238/239 requirements implemented |

### What Needs Fixing (Critical — blocks v1.0)

| # | Issue | Location | Risk |
|---|-------|----------|------|
| C1 | Unsafe `as any` casts accessing Drizzle internals | `src/persistence/sqlite/database.ts:186-187` | Breaks on Drizzle upgrade; silent session leak |
| C2 | Incomplete type narrowing — `as Record<string, unknown>` without shape validation | `src/linear/issue-pagination.ts:31,35,39,46` | Silently accepts malformed GraphQL responses |
| C3 | Inbox insert failures silently swallowed — handler returns success anyway | `src/http/webhook-handler.ts:170-176` | **Data loss**: webhooks appear processed but aren't durably recorded |

### What Needs Fixing (Important — should ship with v1.0)

| # | Issue | Location |
|---|-------|----------|
| I1 | No rate limiting on write-mutating API endpoints | `src/http/server.ts` (read limiter exists, write missing) |
| I2 | 5 test files exceed 600 LOC (maintenance burden) | `tests/orchestrator/lifecycle.test.ts` (1026 LOC) and 4 others |
| I3 | Missing error type discriminators in catch blocks | Multiple modules use `unknown` without narrowing |
| I4 | Orchestrator metrics absent from Prometheus output | `src/observability/metrics.ts` — no queue depth, worker count, completion rate |
| I5 | Config store lifecycle fragility — `getConfig()` throws if `start()` not called | `src/config/store.ts:76-79` |

### What's Missing for v1.0 (Features)

**0 of 17 required features have started.**

## Requirements

**Phase 0: UI/UX Polish (in progress)**
- R0. Complete the v1 UI/UX polish pass on `feature/v1-ui-ux-polish` branch and merge to main before starting feature work

**Phase 1: Hardening Pass**
- R1. Fix C1 — Replace `as any` database session access with typed Drizzle wrapper or plugin
- R2. Fix C2 — Replace `as Record<string, unknown>` casts with proper type guards in Linear client
- R3. Fix C3 — Throw on inbox insert failure instead of returning success; let the caller decide retry behavior
- R4. Fix I1 — Apply rate limiting to write-mutating API endpoints (`/api/config/*`, `/api/templates/*`, `/api/transitions/*`)
- R5. Fix I4 — Add orchestrator metrics: `orchestrator_running_workers`, `orchestrator_queued_issues`, `orchestrator_completed_attempts_total`

**Phase 2: Foundation — Multi-Provider + Extensibility**
- R6. [#23] Agent-agnostic runner — Runner interface + registry, multi-provider support, per-job model overrides, provider cascading
- R7. [#17] Per-project agent rules — SOUL.md personality/identity layer, per-phase prompt templates, project-scoped configuration
- R8. [#20] Plugin / swappable architecture — SKILL.md standard with progressive discovery, YAML adapter config, symlink activation
- R9. [#22] Multi-agent role pipeline — Agent clusters with shared workspaces, per-role concurrency, template variables

**Phase 3: CI/PR Pipeline**
- R10. [#10] Reactions system — CI/review/approval events trigger auto agent actions
- R11. [#59] Auto-squash + conventional commit formatting — Configurable path validation, rich PR comments with execution metrics
- R12. [#35] Review comment ingestion — Parse PR review comments, route to agent for action
- R13. [#36] Re-dispatch on REQUEST_CHANGES — Automatically re-run agent when reviewer requests changes
- R14. [#37] Auto-merge integration PR — Path-restriction controls, environment-based autopilot progression
- R15. [#39] Pre-merge verification — Test/lint gate before marking work as done
- R16. [#25] Acceptance criteria validation — Evaluation reports with structured scoring, pre-push self-review

**Phase 4: Distribution + DX**
- R17. [#177] Database-backed configuration store — SQLite for settings, API keys, state; enables settings UI and secret management
- R18. [#24] Settings UI page — Dashboard-native configuration management
- R19. [#13] `risoluto init --auto` — One-command setup with prerequisite checks, repo creation, secret config, `.env` generation
- R20. [#111] npx-based zero-install distribution — `npx risoluto` with pre-built binaries, setup wizard, auto-update
- R21. [#51] Dashboard polish — Workflow summaries, credential UI, final visual refinements

## Success Criteria

- All 17 feature issues closed with tests and documentation
- Zero critical code quality issues (C1-C3 resolved)
- All important issues (I1-I5) resolved or explicitly deferred with justification
- Playwright E2E coverage for new UI surfaces (settings, dashboard polish)
- `npx risoluto` works end-to-end on a fresh machine with no prior setup
- Operator guide covers all new features and configuration options
- Spec conformance maintained at 238+ (no regressions)

## Scope Boundaries

- **#12 (mobile-responsive dashboard)**: Deferred to v1.1 — not a v1.0 blocker
- **Chat integrations (#66)**: Post-v1.0 — Telegram/Discord/Slack adapters
- **Cron/scheduled jobs (#67)**: Post-v1.0
- **GitLab adapter (#123)**: Post-v1.0
- **Circuit breaker (#71), health daemon (#72)**: Post-v1.0 — provider reliability
- **Secret/config injection (#58)**: Post-v1.0 — dual-tier secret model
- **All Tier 3 and Tier 4 items**: Post-v1.0
- **OpenTelemetry distributed tracing**: Nice-to-have, not required for v1.0

## Key Decisions

- **Hardening before features**: Critical code issues (C1-C3) fixed first to establish a trustworthy base for new work
- **UI/UX polish first**: Current branch finishes and merges before any v1.0 feature work begins
- **Execution order**: Foundation → Pipeline → DX — multi-provider runner (#23) is foundational; CI pipeline and plugin arch both benefit from it being in place
- **Foundation as single epic**: All 4 Foundation items (#17, #20, #22, #23) planned together — they share architectural decisions and benefit from holistic design
- **Legacy roadmap archived**: Issue #9 (97-issue Symphony v2 roadmap) is closed. This document replaces it as the v1.0 scope definition.

## How Close Are We?

```
                        v0.6.0 (now)              v1.0 (target)
                            │                          │
  ╔═══════════════════════════════════════════════════════════════╗
  ║ Core Infrastructure    ████████████████████░░  ~90%          ║
  ║ Feature Completeness   ██████░░░░░░░░░░░░░░  ~30%          ║
  ║ Code Quality           █████████████████░░░░  ~85%          ║
  ║ Testing                ██████████████████░░░  ~90%          ║
  ║ Documentation          ████████████████░░░░░  ~80%          ║
  ║ Distribution/DX        ████░░░░░░░░░░░░░░░░  ~20%          ║
  ╚═══════════════════════════════════════════════════════════════╝
  
  Overall v1.0 readiness:  ████████████░░░░░░░░  ~55-60%
```

**The foundation is strong.** Architecture, testing, persistence, and security are production-grade. The gap is almost entirely in **features** (17 unstarted items) and **distribution** (no npx, no init wizard, no settings UI). The codebase is well-architected enough that feature additions should be clean — the port pattern and plugin points are already in place.

**Biggest risk areas:**
1. **#23 (agent-agnostic runner)** — largest single feature, touches core dispatch loop, affects everything downstream
2. **#20 (plugin architecture)** — architecture decision with long-term consequences; needs careful design
3. **#22 (multi-agent pipeline)** — complex concurrency and shared workspace management
4. **Feature velocity** — 17 features from zero is substantial; each needs tests, docs, and E2E coverage

## Dependencies / Assumptions

- Current UI/UX polish branch will merge cleanly to main (no major conflicts expected)
- Codex app-server protocol remains stable during multi-provider runner development
- Linear and GitHub APIs remain backward-compatible
- The port pattern is extensible enough to support plugin architecture without major refactoring (high confidence based on code review)

## Outstanding Questions

### Deferred to Planning
- [Affects R6][Needs research] Which agent runtimes beyond Codex should v1.0 support? (Claude Code CLI, OpenAI Codex, local models via Ollama?)
- [Affects R8][Technical] Should the plugin architecture use a runtime registry (dynamic loading) or compile-time adapters (static imports)?
- [Affects R20][Needs research] What's the binary packaging strategy for `npx risoluto`? (esbuild bundle, pkg, or sea?)
- [Affects R17][Technical] Should the DB-backed config store replace or layer on top of the current overlay YAML system?
- [Affects R14][Technical] Auto-merge safety: what's the right default for `ALLOWED_PATHS` restrictions?

## Next Steps

→ Resolve the Phase 2 planning question, then `/ce:plan` for the hardening pass (Phase 1) as the first concrete step.
