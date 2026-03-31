---
date: 2026-03-29
topic: linear-webhook-integration
---

# Linear Webhook Integration

## Problem Frame

Risoluto detects Linear issue changes by polling the GraphQL API every 15 seconds. This creates up to 15s latency before new or transitioned issues are picked up, generates unnecessary API traffic when nothing has changed, and locks the architecture into a request-driven model that cannot react to events in real time. Adding inbound Linear webhooks fixes all three: near-instant detection, demand-driven fetching, and a reusable event ingestion pattern for future sources.

## Event & Data Flow

```
Linear Cloud                        Risoluto (public URL)
─────────────                       ────────────────────
  Issue mutated
       │
       ▼
  POST /webhooks/linear ──────────► Webhook Receiver
  (HMAC-signed payload)                  │
                                         ├─ Verify signature
                                         ├─ Parse event type + issue ID
                                         ├─ Record in webhook health tracker
                                         ▼
                                    Event Router
                                         │
                                    ┌────┴─────┐
                                    │ Matches   │ No match
                                    │ workflow? │──────► Log + discard
                                    └────┬─────┘
                                         │
                                         ▼
                                    requestRefresh("webhook:<event-type>")
                                         │
                                         ▼
                                    Orchestrator Tick (immediate)
                                         │
                                         ├─ fetchCandidateIssues()
                                         ├─ reconcile / launch workers
                                         └─ update dashboard

  ┌──────────────────────────────────────────────────────────┐
  │  Adaptive Polling                                        │
  │                                                          │
  │  Webhook healthy (subscription active + no delivery      │
  │    failures detected):                                   │
  │    polling interval → stretched (60-120s heartbeat)      │
  │                                                          │
  │  Webhook degraded (delivery failures, signature errors,  │
  │    or subscription status unhealthy):                    │
  │    polling interval → shrinks back toward 15s            │
  │                                                          │
  │  Webhook unconfigured:                                   │
  │    polling interval → unchanged (15s default)            │
  └──────────────────────────────────────────────────────────┘
```

## Requirements

**Webhook Receiver**
- R1. Expose a `POST /webhooks/linear` endpoint on Risoluto's HTTP server that accepts Linear webhook payloads
- R2. Verify every inbound request using Linear's HMAC signing secret; reject invalid signatures with 401
- R3. Accept all Linear issue mutation event types (state change, create, update, delete, assignment, label, priority, etc.)
- R4. Respond 200 immediately after signature verification; process the event asynchronously to avoid blocking Linear's delivery timeout
- R5. Rate-limit inbound webhook requests per source IP to prevent abuse

**Auto-Registration**
- R6. On startup, use the Linear API to create or update (and re-enable if disabled) a webhook subscription pointing to the configured `webhook_url`, scoped to the relevant team/project. Also re-register when `webhook_url` changes at runtime via config reload.
- R7. If auto-registration fails (insufficient permissions, network error), log clear instructions for manual setup and continue in polling-only mode

**Adaptive Polling**
- R8. When webhooks are configured and healthy, stretch the polling interval to a configurable maximum (default 120s) as a heartbeat/catch-up mechanism
- R9. Track webhook health using positive signals (subscription status, successful deliveries, absence of error responses) — not "time since last event," since quiet projects legitimately have long gaps between events. The health model must distinguish "nothing happened in Linear" from "webhook delivery is broken."
- R10. When webhook health degrades (delivery failures, signature errors, subscription status unhealthy), shrink the polling interval back toward the base rate (15s)
- R11. When webhooks are not configured, polling behavior is unchanged from today
- R12. Expose the current effective polling interval and webhook health status via the runtime state API

**Dashboard Observability**
- R13. Display webhook connection health status (connected / degraded / disconnected) on the dashboard
- R14. Show last received webhook event timestamp and type
- R15. Display the current adaptive polling interval so operators can see the behavior in real time
- R16. Show webhook delivery statistics (events received, signature failures, processing errors) in a dashboard section or expandable panel

**Idempotency**
- R17. Webhook processing must be idempotent — duplicate deliveries (Linear retries) and out-of-order events must not cause incorrect state. The orchestrator's `fetchCandidateIssues()` already fetches authoritative state from GraphQL on each tick, so webhooks are triggers, not state carriers.

**Configuration**
- R18. Webhook integration is opt-in via workflow file configuration: `webhook_url`, optional `webhook_secret` (for manual setup), and adaptive polling thresholds
- R19. Support environment variable expansion for secrets (e.g., `$LINEAR_WEBHOOK_SECRET`) consistent with existing credential handling

## Success Criteria

- Issue state changes in Linear are detected and acted on by Risoluto within 2 seconds (p95) when webhooks are healthy, vs. up to 15s today
- Polling API calls to Linear drop by 80%+ during normal webhook operation
- If webhooks stop delivering, Risoluto automatically recovers to full polling within one threshold window — no operator intervention, no missed issues
- The webhook receiver, adaptive polling, and event routing are structured as a reusable pattern that future event sources (GitHub webhooks, cron triggers, etc.) can follow

## Scope Boundaries

- **In scope**: Inbound Linear webhooks, adaptive polling, auto-registration, dashboard observability, webhook signature verification
- **Out of scope**: Generic webhook dispatch API (Issue #32) — this work focuses on Linear as an event *source*, not Risoluto as a webhook *receiver* for arbitrary external triggers. The two should share infrastructure where natural, but #32 has its own scope.
- **Out of scope**: Cloudflare Tunnel provisioning or DNS configuration — the operator provides a reachable `webhook_url`. Documentation should cover the Cloudflare subdomain setup (e.g., `webhooks.risolu.to`) as a recommended pattern.
- **Out of scope**: Webhook replay/retry from Linear's side — Linear handles its own retry logic. Risoluto just needs to be idempotent in processing.
- **Out of scope**: Multi-instance webhook coordination — Risoluto is a single-instance process. Webhook registration assumes one instance owns the subscription.

## Key Decisions

- **Adaptive hybrid over webhook-only or simple hybrid**: Maximizes resilience. Webhooks provide speed; adaptive polling provides catch-up. The system self-heals without operator intervention.
- **Broad event subscription over selective**: Subscribe to all issue mutations rather than specific event types. Avoids reconfiguring Linear webhooks as Risoluto's needs evolve. The event router inside Risoluto decides what to act on.
- **Auto-register with manual fallback**: Minimizes operator setup friction. Falls back gracefully when the Linear API token lacks webhook management permissions.
- **Full dashboard visibility**: Operators should see the adaptive system working — health status, current interval, event stats. Builds trust and simplifies troubleshooting.
- **Dropped R8 (disable on shutdown)**: The adaptive fallback already handles "webhooks delivering to a stopped instance." Disabling on shutdown would require persisting webhook IDs, adding shutdown hooks, and still wouldn't cover crash scenarios. Removed from v1 scope.
- **Webhooks as triggers, not state carriers**: Webhook payloads are used to trigger an immediate `requestRefresh()`, not to update issue state directly. The authoritative state always comes from `fetchCandidateIssues()` via GraphQL. This makes duplicate/out-of-order delivery harmless.
- **Existing coalescing handles bursts**: Bulk operations in Linear (e.g., 50 issues transitioned) produce 50 webhooks. The existing `refreshQueued` flag merges these into one tick naturally. No debouncing or batching needed.
- **Reconcile-on-tick for running workers**: When a webhook indicates a running issue changed state (e.g., operator marks it Done), the existing `reconcileRunningAndRetryingState()` handles cleanup on the next tick. No worker interrupt mechanism needed.
- **Single instance constraint**: Risoluto is always a single-instance process. No multi-instance webhook coordination, deduplication, or leader election.

## Dependencies / Assumptions

- Linear API token used by Risoluto has webhook create/update permissions for auto-registration (or operator handles manual setup)
- Risoluto's HTTP server is reachable at the configured `webhook_url` from the public internet (Cloudflare subdomain + tunnel, cloud deploy, or reverse proxy)
- Linear's webhook payload format and signing mechanism are stable (they use standard HMAC-SHA256)
- Risoluto runs as a single instance — no multi-instance coordination needed

## Outstanding Questions

### Deferred to Planning
- [Affects R6][Needs research] What Linear API permissions are required for webhook CRUD? Does the standard `api_key` scope cover it, or does it need an OAuth app?
- [Affects R1, R2][Technical] The webhook endpoint needs raw body access for HMAC verification, but `express.json()` is applied globally and consumes the raw buffer. Plan must specify middleware ordering (separate route before JSON parser, `verify` callback, or sub-app).
- [Affects R1][Technical] The write guard (`write-guard.ts`) rejects non-GET requests from non-loopback IPs. The webhook route needs a path-based exemption since it has its own HMAC auth. Plan must specify the exemption strategy.
- [Affects R1][Technical] Should the webhook endpoint share the existing Express server on port 4000, or run on a separate port for isolation?
- [Affects R8-R10][Technical] The orchestrator reads `polling.intervalMs` from immutable config each tick. Adaptive polling needs a runtime override mechanism (e.g., `getEffectivePollingIntervalMs()` or injecting the webhook health tracker into orchestrator deps).
- [Affects R9][Needs research] What positive health signals does Linear's webhook API expose? (subscription status, delivery logs, ping/test endpoint?) This determines how the health model distinguishes "quiet project" from "broken delivery."
- [Affects R3][Needs research] What is the exact payload schema for Linear webhook events? Document the relevant fields for the event router.
- [Affects R13-R16][Technical] Webhook stats need new fields on `RuntimeSnapshot` and new event types on `RisolutoEventMap`. Plan should name the integration points.
- [Affects R6][Technical] How does this relate to Issue #32's planned `/webhooks/` endpoint and HMAC infrastructure? Can they share a common webhook receiver base?

## Next Steps

→ `/ce:plan` for structured implementation planning
