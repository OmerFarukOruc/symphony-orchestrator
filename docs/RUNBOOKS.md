# 🔧 Symphony Runbooks

> Operational playbooks grounded in actual committed code.

---

## Service Won't Start

**Symptoms**: CLI exits immediately, HTTP server doesn't bind.

1. **Check port conflicts** — `HttpServer.start()` in `src/http-server.ts` binds to the configured port (default: 4000).
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
4. **Check workflow file** — ensure the YAML front matter in your workflow file is valid.
   ```bash
   node dist/cli.js ./WORKFLOW.md
   ```

---

## Linear API Rate Limiting

**Symptoms**: Dashboard shows `rateLimits` with `retryAfter` values, polling slows.

1. **Check current rate limits** — query the state API:
   ```bash
   curl -s http://127.0.0.1:4000/api/v1/state | jq '.rate_limits'
   ```
2. **Orchestrator backoff** — `src/orchestrator.ts` has built-in exponential backoff for rate-limited polls. No manual intervention needed unless limits persist beyond 10 minutes.
3. **Reduce poll frequency** — increase `polling.intervalMs` in your workflow YAML.

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
3. **Review workspace** — check if the workspace directory exists and has expected content. Workspace management lives in `src/workspace-manager.ts`.
4. **Stall timeout** — the orchestrator detects stalls via `stallTimeoutMs` in config. If the agent hasn't produced events within that window, it will be cancelled automatically.

---

## Dashboard Shows Stale Data

**Symptoms**: Dashboard doesn't reflect current Linear state.

1. **Force poll**:
   ```bash
   curl -X POST http://127.0.0.1:4000/api/v1/refresh
   ```
2. **Check polling interval** — verify `polling.intervalMs` in your workflow YAML isn't set too high.
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
3. **Limit turns** — reduce `agent.maxTurns` in your workflow YAML.
