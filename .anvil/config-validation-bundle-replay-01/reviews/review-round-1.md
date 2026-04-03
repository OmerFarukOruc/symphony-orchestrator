---
plan: "feat: Config & validation bundle"
round: 1
mode: review
model: codex-main-session
date: 2026-04-03
verdict: CONDITIONAL GO
confidence: 86%
overall_score: 7.8/10
---

# Hostile Review Round 1

## Findings

1. **High -- stale product framing around `WORKFLOW.md`.** The issue briefs for #325 and #330 still talk as if `WORKFLOW.md` is a live runtime contract, but the repo now uses it only for one-time legacy import through `src/config/legacy-import.ts` and `src/workflow/loader.ts`. A plan that treats workflow files as the main runtime config would be architecturally wrong for this repo.

2. **High -- duplicate-cache risk in #263.** `src/config/store.ts` already caches a fully derived `ServiceConfig` and refreshes on overlay and secret changes. Planning a brand-new per-key cache would duplicate existing behavior instead of fixing the real gaps: workflow/DB invalidation, dependent singleton reloads, and long-lived services with frozen config snapshots.

3. **High -- provider registry could overpromise transport support.** `src/codex/runtime-config.ts` still renders one provider block around the existing Codex runtime contract. The bundle must not imply a new dispatcher or direct non-OpenAI transport layer unless the plan explicitly adds one, which it does not.

4. **Medium -- git identity has to cover both sides of the boundary.** Applying identity only inside Docker workers would still leave host-side `git commit` and push flows unmanaged in `src/git/manager.ts`.

5. **Medium -- operator-facing truth is currently inconsistent.** `src/setup/handlers/openai-key.ts` injects a `CLIProxyAPI` provider preset by default, while the docs describe direct OpenAI API auth as the primary API-key path. The plan must reconcile code and docs rather than preserving both stories.

6. **Medium -- hot reload scope needs an explicit contract.** `src/git/pr-monitor.ts` snapshots `AgentConfig` at construction and never rereads `prMonitorIntervalMs`. The plan needs a crisp distinction between hot-reloadable config and restart-required config.

## Settlements Applied

- **S1.** Constrained strict workflow validation and alias normalization to the repo's actual raw-config ingress points, with `WORKFLOW.md` treated as legacy import only.
- **S2.** Reframed #263 as explicit invalidation, config-source subscription, and consumer reload work on top of the existing cached snapshot.
- **S3.** Scoped the provider registry to registry-backed presets layered on the existing Codex runtime transport, not a new multi-provider dispatcher.
- **S4.** Added host-side git, Docker worker, and partial-identity fallthrough requirements to the git identity unit.
- **S5.** Made setup/API truth reconciliation an explicit execution unit rather than a documentation afterthought.
- **S6.** Added a requirement that long-lived consumers either hot-reload or emit restart-required warnings.

## Verdict

The bundle is worth doing and the grouping is sound, but only after the plan absorbs the six settlements above. With those adjustments, the bundle becomes execution-ready for this repo instead of replaying stale roadmap assumptions.
