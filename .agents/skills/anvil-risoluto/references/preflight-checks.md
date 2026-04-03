# Preflight Checks

Run these before intake. Fail fast on environmental issues instead of discovering them mid-execution.

## Required checks

### Git state

- Working tree is clean: `git status --porcelain` is empty
- Current branch is `main` or the expected base branch
- No stale worktrees from a previous run: inspect `git worktree list`

### Build health

- `pnpm run build` passes

### Active run conflict

- If `.anvil/ACTIVE_RUN` exists and points to a different slug:
  - read that run's `status.json`
  - if `active = true`, block and tell the operator to pause or complete it first
  - if `active = false`, proceed

### Credentials

Use request metadata or an existing `bundle.json` when available to decide whether API credentials are required.

- `gh auth status` succeeds
- if the run needs Linear-backed verification or external issue flow, `LINEAR_API_KEY` must be set and non-empty

### Docker

If the run touches orchestrator, worker, sandbox, or lifecycle E2E behavior:

- `docker info` succeeds
- Docker daemon is responsive enough for lifecycle E2E

## On failure

- Set `phase = "preflight"`, `phase_status = "blocked"`, `active = false`
- Set `last_failure_reason` to the specific check that failed
- Set `next_required_action` to the exact operator fix
- Write `preflight.md` with the blocker
- Refresh `handoff.md`
- Do not proceed to intake

## On success

- Append a preflight-passed entry to `pipeline.log`
- Write `preflight.md`
- Transition to intake
