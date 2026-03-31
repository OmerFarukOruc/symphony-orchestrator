# 🔧 Risoluto Runbooks

> Operational playbooks grounded in actual committed code.

---

## Service Won't Start

**Symptoms**: CLI exits immediately, HTTP server doesn't bind.

1. **Check port conflicts** — `HttpServer.start()` in `src/http/server.ts` binds to the configured port (default: 4000).
   ```bash
   lsof -i :4000
   ```
2. **Verify Node.js version** — requires Node ≥22 (`package.json` engines field).
   ```bash
   node --version
   ```
3. **Check LINEAR_API_KEY** — the orchestrator requires a valid API key.
   ```bash
   echo $LINEAR_API_KEY | head -c 10
   ```
4. **Check config overlay** — verify that the overlay YAML is valid:
   ```bash
   curl -s http://127.0.0.1:4000/api/v1/config/overlay | jq .
   ```

---

## Linear API Rate Limiting

**Symptoms**: Dashboard shows non-null `rate_limits`, Codex requests are being throttled, or Linear calls start failing under sustained load.

1. **Check current rate limits** — query the state API:
   ```bash
   curl -s http://127.0.0.1:4000/api/v1/state | jq '.rate_limits'
   ```
2. **Interpret the source correctly** — the `rate_limits` field comes from Codex `account/rateLimits/read` preflight, not a dedicated Linear poll-backoff subsystem.
3. **Reduce Linear pressure** — increase `polling.interval_ms` via the config overlay API or the Settings page if you are polling too aggressively.
4. **Check tracker credentials and endpoint** — verify `tracker.api_key` and `tracker.endpoint` still point at the expected Linear API.

---

## Agent Stuck / Not Progressing

**Symptoms**: Issue stays in "running" state, no new events in dashboard.

1. **Check recent events** — look for stall indicators:
   ```bash
   curl -s http://127.0.0.1:4000/api/v1/state | jq '.recent_events[-5:]'
   ```
2. **Force a re-poll** — trigger manual refresh:
   ```bash
   curl -X POST http://127.0.0.1:4000/api/v1/refresh
   ```
3. **Review workspace** — check if the workspace directory exists and has expected content. Workspace management lives in `src/workspace/manager.ts`.
4. **Stall timeout** — there are two independent stall knobs: `codex.stall_timeout_ms` (per-turn stall, default 5 min) and `agent.stall_timeout_ms` (orchestrator-level stall detector, default 20 min). The orchestrator-level detector fires if an agent emits no events for `agent.stall_timeout_ms` milliseconds and aborts + requeues it. Set either to `0` or a negative value to disable that level of stall cancellation during debugging.

---

## Dashboard Shows Stale Data

**Symptoms**: Dashboard doesn't reflect current Linear state.

1. **Force poll**:
   ```bash
   curl -X POST http://127.0.0.1:4000/api/v1/refresh
   ```
2. **Check polling interval** — verify `polling.interval_ms` in the config overlay isn't set too high.
3. **Browser cache** — hard-refresh the browser (`Ctrl+Shift+R`).

---

## High Token Usage

**Symptoms**: `codex_totals` in state API shows unexpectedly large numbers.

1. **Check totals**:
   ```bash
   curl -s http://127.0.0.1:4000/api/v1/state | jq '.codex_totals'
   ```
2. **Adjust model** — switch to a more efficient model per-issue:
   ```bash
   curl -X POST http://127.0.0.1:4000/api/v1/MT-42/model \
     -H 'Content-Type: application/json' \
     -d '{"model": "gpt-4.1-mini", "reasoning_effort": "medium"}'
   ```
3. **Limit turns** — reduce `agent.max_turns` via the config overlay API or the Settings page.
