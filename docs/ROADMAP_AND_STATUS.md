# 🗺️ Roadmap and Status

> Reconciled status summary for the active Risoluto roadmap.

<p>
  <img alt="Version" src="https://img.shields.io/badge/version-0.6.0-blue?style=flat-square" />
  <img alt="Spec Conformance" src="https://img.shields.io/badge/spec-238%2F239-brightgreen?style=flat-square" />
  <img alt="Open Roadmap Features" src="https://img.shields.io/badge/open_roadmap_features-71-blue?style=flat-square" />
</p>

> [!NOTE]
> The canonical roadmap epic is [#354 — Symphony v2 Feature Roadmap (2026 Research Reset)](https://github.com/OmerFarukOruc/risoluto/issues/354). The older [#9 — Symphony v2 Feature Roadmap](https://github.com/OmerFarukOruc/risoluto/issues/9) issue is a historical snapshot only and should not be used as the source of truth for current planning.

> [!NOTE]
> For the focused v1.0 delivery slice, see [docs/plans/2026-04-01-002-feat-v1-roadmap-plan.md](plans/2026-04-01-002-feat-v1-roadmap-plan.md). This file summarizes the broader roadmap backlog plus the latest shipped and triaged roadmap work.

---

## Reconciliation Snapshot

- **Reconciled:** 2026-04-04
- **Canonical roadmap epic:** [#354](https://github.com/OmerFarukOruc/risoluto/issues/354)
- **Historical roadmap snapshot:** [#9](https://github.com/OmerFarukOruc/risoluto/issues/9)
- **Counting rule:** feature totals exclude the active roadmap epic **#354** and the long-range vision issue **#62**
- **Current open roadmap count:** **71** features

This `71` count reflects the reconciled post-merge roadmap inventory for **2026-04-04**, after closing the following shipped issues and excluding the active roadmap epic **#354** plus the long-range vision issue **#62**:

- [#254](https://github.com/OmerFarukOruc/risoluto/issues/254)
- [#258](https://github.com/OmerFarukOruc/risoluto/issues/258)
- [#260](https://github.com/OmerFarukOruc/risoluto/issues/260)
- [#262](https://github.com/OmerFarukOruc/risoluto/issues/262)
- [#275](https://github.com/OmerFarukOruc/risoluto/issues/275)
- [#276](https://github.com/OmerFarukOruc/risoluto/issues/276)
- [#278](https://github.com/OmerFarukOruc/risoluto/issues/278)
- [#282](https://github.com/OmerFarukOruc/risoluto/issues/282)
- [#286](https://github.com/OmerFarukOruc/risoluto/issues/286)
- [#292](https://github.com/OmerFarukOruc/risoluto/issues/292)
- [#299](https://github.com/OmerFarukOruc/risoluto/issues/299)
- [#303](https://github.com/OmerFarukOruc/risoluto/issues/303)
- [#307](https://github.com/OmerFarukOruc/risoluto/issues/307)
- [#308](https://github.com/OmerFarukOruc/risoluto/issues/308)
- [#315](https://github.com/OmerFarukOruc/risoluto/issues/315)
- [#318](https://github.com/OmerFarukOruc/risoluto/issues/318)
- [#319](https://github.com/OmerFarukOruc/risoluto/issues/319)
- [#326](https://github.com/OmerFarukOruc/risoluto/issues/326)
- [#333](https://github.com/OmerFarukOruc/risoluto/issues/333)
- [#335](https://github.com/OmerFarukOruc/risoluto/issues/335)
- [#346](https://github.com/OmerFarukOruc/risoluto/issues/346)
- [#375](https://github.com/OmerFarukOruc/risoluto/issues/375)

The same reconciliation pass also relabeled the strongest partials from `research` to `triage`: [#254](https://github.com/OmerFarukOruc/risoluto/issues/254), [#261](https://github.com/OmerFarukOruc/risoluto/issues/261), [#262](https://github.com/OmerFarukOruc/risoluto/issues/262), [#263](https://github.com/OmerFarukOruc/risoluto/issues/263), [#271](https://github.com/OmerFarukOruc/risoluto/issues/271), [#313](https://github.com/OmerFarukOruc/risoluto/issues/313), [#315](https://github.com/OmerFarukOruc/risoluto/issues/315), [#317](https://github.com/OmerFarukOruc/risoluto/issues/317), [#325](https://github.com/OmerFarukOruc/risoluto/issues/325), [#344](https://github.com/OmerFarukOruc/risoluto/issues/344), [#367](https://github.com/OmerFarukOruc/risoluto/issues/367), and [#373](https://github.com/OmerFarukOruc/risoluto/issues/373).

---

## Recently Shipped

The following roadmap issues were completed and should no longer be counted as open backlog:

| Issue | Feature | Bundle | Status |
| --- | --- | --- | --- |
| [#254](https://github.com/OmerFarukOruc/risoluto/issues/254) | Channel adapter pattern for multi-channel notifications | Notifications, Chat & Triggers | Shipped 2026-04-04 |
| [#260](https://github.com/OmerFarukOruc/risoluto/issues/260) | Cron-based scheduled triggers for recurring actions | Notifications, Chat & Triggers | Shipped 2026-04-04 |
| [#262](https://github.com/OmerFarukOruc/risoluto/issues/262) | Webhook trigger endpoints for external event-driven dispatch | Notifications, Chat & Triggers | Shipped 2026-04-04 |
| [#282](https://github.com/OmerFarukOruc/risoluto/issues/282) | Rule-based alerting engine with multi-channel dispatch | Notifications, Chat & Triggers | Shipped 2026-04-04 |
| [#286](https://github.com/OmerFarukOruc/risoluto/issues/286) | Cron-scheduled automation workflows with report modes | Notifications, Chat & Triggers | Shipped 2026-04-04 |
| [#292](https://github.com/OmerFarukOruc/risoluto/issues/292) | Persistent typed notification system with dashboard API | Notifications, Chat & Triggers | Shipped 2026-04-04 |
| [#308](https://github.com/OmerFarukOruc/risoluto/issues/308) | Cross-platform desktop notifications for agent completion | Notifications, Chat & Triggers | Shipped 2026-04-04 |
| [#315](https://github.com/OmerFarukOruc/risoluto/issues/315) | Webhook receiver for push-based issue ingestion from Linear and GitHub | Notifications, Chat & Triggers | Shipped 2026-04-04 |
| [#276](https://github.com/OmerFarukOruc/risoluto/issues/276) | Issue dependency blocker detection in dispatch selection | Multi-Agent / Orchestration | Shipped 2026-04-03 |
| [#278](https://github.com/OmerFarukOruc/risoluto/issues/278) | Execution replay system with phase-aware event recording | Persistence / State | Shipped 2026-04-03 |
| [#319](https://github.com/OmerFarukOruc/risoluto/issues/319) | Pre-cleanup commit enforcement to prevent silent work loss | Persistence / State | Shipped 2026-04-03 |
| [#275](https://github.com/OmerFarukOruc/risoluto/issues/275) | Tracker completion comments with execution metrics write-back | PR / CI | Shipped 2026-04-03 |
| [#299](https://github.com/OmerFarukOruc/risoluto/issues/299) | Workspace lifecycle hooks — operator-defined scripts at create/run/remove | Sandbox / Security | Shipped 2026-04-03 |
| [#303](https://github.com/OmerFarukOruc/risoluto/issues/303) | Safe subprocess environment whitelist for agent process isolation | Sandbox / Security | Shipped 2026-04-03 |
| [#318](https://github.com/OmerFarukOruc/risoluto/issues/318) | SSE stream reconnection with exponential backoff and session awareness | Agent Runtime / Execution | Shipped 2026-04-03 |
| [#326](https://github.com/OmerFarukOruc/risoluto/issues/326) | Codex app-server v2 JSON-RPC protocol alignment (thread/turn lifecycle) | Agent Runtime / Execution | Shipped 2026-04-03 |
| [#335](https://github.com/OmerFarukOruc/risoluto/issues/335) | Agent-authored PR summary generation from branch diff | PR / CI | Shipped 2026-04-03 |
| [#346](https://github.com/OmerFarukOruc/risoluto/issues/346) | Crash recovery system for orphaned sessions and workspaces | Persistence / State | Shipped 2026-04-03 |
| [#333](https://github.com/OmerFarukOruc/risoluto/issues/333) | PR review feedback ingestion for retry-with-context re-runs | PR / CI | Shipped 2026-04-03 |
| [#258](https://github.com/OmerFarukOruc/risoluto/issues/258) | Auto-merge policy engine for agent PRs | PR / CI | Shipped 2026-04-03 |
| [#307](https://github.com/OmerFarukOruc/risoluto/issues/307) | PR lifecycle monitoring with auto-archive on merge | PR / CI | Shipped 2026-04-03 |
| [#375](https://github.com/OmerFarukOruc/risoluto/issues/375) | Attempt checkpoint history with timeline listing for recovery and replay | Persistence / State | Shipped 2026-04-03 |

For audit evidence and implementation detail, see [roadmap-implementation-audit-2026-04-03.md](roadmap-implementation-audit-2026-04-03.md), [EXECPLAN.md](../EXECPLAN.md), and [CONFORMANCE_AUDIT.md](CONFORMANCE_AUDIT.md#prci-automation-bundle-2026-04-03).

---

## Post-Reset Additions

Issue [#354](https://github.com/OmerFarukOruc/risoluto/issues/354) introduced six post-reset roadmap additions after the March 28, 2026 research reset. Their current local reconciliation status is:

| Issue | Feature | Bundle | Status |
| --- | --- | --- | --- |
| [#366](https://github.com/OmerFarukOruc/risoluto/issues/366) | Fanout/merge execution — parallel sub-task agents per issue | Orchestration | Open |
| [#367](https://github.com/OmerFarukOruc/risoluto/issues/367) | Preflight diagnostic system — `risoluto doctor` CLI command | Config | Open · triage |
| [#368](https://github.com/OmerFarukOruc/risoluto/issues/368) | Interactive dependency graph visualization in dashboard | Dashboard | Open |
| [#369](https://github.com/OmerFarukOruc/risoluto/issues/369) | Per-step success criteria validation with configurable rules | Runtime | Open |
| [#373](https://github.com/OmerFarukOruc/risoluto/issues/373) | Docker Sandboxes (`sbx`) executor backend — microVM isolation for agent workers | Security / Auth | Open · triage |
| [#375](https://github.com/OmerFarukOruc/risoluto/issues/375) | Attempt checkpoint history with timeline listing for recovery and replay | Persistence | Shipped 2026-04-03 |

---

## Strong Partials Now in Triage

The 2026-04-03 code audit found meaningful shipped overlap for these still-open roadmap issues, so they were relabeled from `research` to `triage` in GitHub rather than left as untouched backlog:

- [#261](https://github.com/OmerFarukOruc/risoluto/issues/261) — LLM provider registry with capability flags and credential validation
- [#263](https://github.com/OmerFarukOruc/risoluto/issues/263) — Config cache with invalidation for hot-reloadable settings
- [#271](https://github.com/OmerFarukOruc/risoluto/issues/271) — MCP server tools for tracker GraphQL access by agents
- [#313](https://github.com/OmerFarukOruc/risoluto/issues/313) — Bounded concurrency scheduler with FIFO queue for worker dispatch
- [#317](https://github.com/OmerFarukOruc/risoluto/issues/317) — Label-based multi-repo routing engine for single-instance multi-repo orchestration
- [#325](https://github.com/OmerFarukOruc/risoluto/issues/325) — Config key alias normalization (snake_case/camelCase compatibility)
- [#344](https://github.com/OmerFarukOruc/risoluto/issues/344) — Configurable reaction engine for CI failures, reviews, and merge events
- [#367](https://github.com/OmerFarukOruc/risoluto/issues/367) — Preflight diagnostic system — `risoluto doctor` CLI command
- [#373](https://github.com/OmerFarukOruc/risoluto/issues/373) — Docker Sandboxes (`sbx`) executor backend — microVM isolation for agent workers

---

## Open Bundle Summary

These counts mirror the live open issue inventory in [#354](https://github.com/OmerFarukOruc/risoluto/issues/354) after the 2026-04-03 shipped-issue closures and the `research` → `triage` relabeling pass.

| Bundle | Open Issues | Notes |
| --- | ---: | --- |
| Agent Runtime & Execution | 16 | [#318](https://github.com/OmerFarukOruc/risoluto/issues/318) and [#326](https://github.com/OmerFarukOruc/risoluto/issues/326) moved to shipped; [#369](https://github.com/OmerFarukOruc/risoluto/issues/369) remains open |
| Multi-Agent & Orchestration | 12 | [#276](https://github.com/OmerFarukOruc/risoluto/issues/276) moved to shipped; includes [#366](https://github.com/OmerFarukOruc/risoluto/issues/366) and triage follow-ups [#313](https://github.com/OmerFarukOruc/risoluto/issues/313), [#317](https://github.com/OmerFarukOruc/risoluto/issues/317), and [#344](https://github.com/OmerFarukOruc/risoluto/issues/344) |
| Observability & Logging | 12 | No shipped-count change in this reconciliation |
| Plugin Architecture & Adapters | 11 | Includes triage follow-up [#271](https://github.com/OmerFarukOruc/risoluto/issues/271) |
| Notifications, Chat & Triggers | 0 | Notifications / triggers / automations bundle shipped on 2026-04-04 |
| Config & Validation | 7 | Includes triage follow-ups [#261](https://github.com/OmerFarukOruc/risoluto/issues/261), [#263](https://github.com/OmerFarukOruc/risoluto/issues/263), [#325](https://github.com/OmerFarukOruc/risoluto/issues/325), and post-reset issue [#367](https://github.com/OmerFarukOruc/risoluto/issues/367) |
| Sandbox & Security | 6 | [#299](https://github.com/OmerFarukOruc/risoluto/issues/299) and [#303](https://github.com/OmerFarukOruc/risoluto/issues/303) moved to shipped |
| Dashboard & UI | 4 | Includes post-reset issue [#368](https://github.com/OmerFarukOruc/risoluto/issues/368) |
| PR Review & CI Pipeline | 2 | Open backlog is now only [#288](https://github.com/OmerFarukOruc/risoluto/issues/288) and [#347](https://github.com/OmerFarukOruc/risoluto/issues/347) |
| Persistence & State | 0 | [#278](https://github.com/OmerFarukOruc/risoluto/issues/278), [#319](https://github.com/OmerFarukOruc/risoluto/issues/319), [#346](https://github.com/OmerFarukOruc/risoluto/issues/346), and [#375](https://github.com/OmerFarukOruc/risoluto/issues/375) moved to shipped |
| Security & Auth | 1 | Post-reset issue [#373](https://github.com/OmerFarukOruc/risoluto/issues/373) remains open · triage |
| **Total** | **71** | Reflects the reconciled post-merge roadmap count for 2026-04-04 |

---

## Current Interpretation

- The active roadmap is now best thought of as a **bundle-based roadmap ledger**, with the canonical per-issue inventory living in GitHub issue [#354](https://github.com/OmerFarukOruc/risoluto/issues/354).
- The current backlog is a mix of fresh research items, stronger partials promoted to `triage`, and shipped issues already reconciled out of the open count.
- The local repo should use this file for **status, shipped bundles, triaged partials, and reconciled counts**, not for duplicating every issue body inline.
- The narrower **v1.0 execution slice** is intentionally tracked separately in [docs/plans/2026-04-01-002-feat-v1-roadmap-plan.md](plans/2026-04-01-002-feat-v1-roadmap-plan.md).

---

## How to Keep This Document Current

> [!NOTE]
> When roadmap issue state changes, update this file together with any public roadmap blurbs in `README.md`.

- If a roadmap issue ships, move it into **Recently Shipped** and update the affected bundle count.
- If a new roadmap issue is created after the research reset, add it to **Post-Reset Additions** until the canonical epic gets a full refresh.
- If an open roadmap issue is reclassified from `research` to `triage`, reflect that here and in issue [#354](https://github.com/OmerFarukOruc/risoluto/issues/354).
- If a static count here disagrees with the live GitHub issue state, **GitHub wins**.
- When the operator-facing implementation changes, keep [CONFORMANCE_AUDIT.md](CONFORMANCE_AUDIT.md) in sync as well.
