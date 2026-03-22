# Handover: Resilience Foundation — Frontend Gap Review

## Context

The `feature/resilience-foundation` branch (6 commits, +990 lines) added backend resilience features to Symphony Orchestrator. The backend is fully wired but **the dashboard has zero rendering** for the new data. Your job is to review the code and confirm what frontend work is needed.

## Branch & Commits

```
283d0fa feat(linear): add write-back methods to LinearClient
d1e37d3 feat(types): extend AgentConfig with successState and stallTimeoutMs
bfcce0d feat(orchestrator): add stall-detector module
2790960 feat(orchestrator): add Watchdog health monitor
a28035c feat(orchestrator): wire Linear write-back into worker-outcome
b808049 feat(orchestrator): wire stall-detector and watchdog into orchestrator lifecycle
```

## What Was Added (Backend)

### 1. Stall Detector (`src/orchestrator/stall-detector.ts`)
- Detects running agents with no events for longer than `config.agent.stallTimeoutMs` (default 20 min)
- Aborts stalled agents so retry mechanism can requeue
- Records `StallEvent` per kill, capped at 100
- Context interface: `StallDetectorContext`

### 2. Watchdog (`src/orchestrator/watchdog.ts`)
- Periodic health check (default 60s interval)
- Status: `healthy` / `degraded` / `critical`
  - **Degraded** = stalls in last 5 min
  - **Critical** = queued issues but zero running agents
- Exposes `getHealth()` → `SystemHealth` snapshot

### 3. Linear Write-Back (`src/linear/client.ts`, `src/orchestrator/worker-outcome.ts`)
- On successful agent run: posts comment to Linear issue (tokens, duration, attempt #, PR URL)
- Optionally transitions issue state to `config.agent.successState`
- Fire-and-forget with 3 retries + exponential backoff

### 4. Types Added (`src/core/types.ts`)
```typescript
interface StallEventView {
  issueId: string;
  agentId: string;
  stalledForMs: number;
  killedAt: string;
}

interface SystemHealth {
  status: "healthy" | "degraded" | "critical";
  checkedAt: string;
  runningCount: number;
  recentStalls: StallEventView[];
  message: string;
}
```

### 5. Snapshot Wiring
`RuntimeSnapshot` now includes:
- `stallEvents?: StallEventView[]`
- `systemHealth?: SystemHealth`

Both are populated by `snapshot-builder.ts` and available at the `/api/snapshot` route.

## Frontend Gap

**No file in `src/http/` references `stallEvents` or `systemHealth`.** The dashboard does not render either field.

### What Needs Building

1. **System Health indicator** — colored badge (green/yellow/red) showing `systemHealth.status`, `systemHealth.message`, and `checkedAt` timestamp
2. **Stall Events timeline/table** — render `stallEvents[]` showing issue key, agent ID, stalled duration, killed-at time
3. The data is already in the snapshot API response — only presentation layer work is needed

## Key Files to Review

| File | What to look at |
|------|-----------------|
| `src/core/types.ts` | `StallEventView`, `SystemHealth`, `RuntimeSnapshot` extensions |
| `src/orchestrator/stall-detector.ts` | Stall detection logic + `StallEvent` type |
| `src/orchestrator/watchdog.ts` | Health status computation |
| `src/orchestrator/snapshot-builder.ts` | How both fields get into the snapshot |
| `src/http/routes.ts` | Confirm neither field is referenced yet |

## Ask

Please review the branch, confirm the above analysis, and outline specific frontend implementation tasks with file names and component structure.
