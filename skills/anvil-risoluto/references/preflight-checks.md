# Preflight Checks

Run these before intake. Fail fast on environmental issues instead of discovering them mid-execution.

## Required checks

### Git state

- Before execution begins, the working tree should be clean: `git status --porcelain` is empty
- Before execution begins, the current branch should be `main` or the expected base branch
- During or after execution, the recorded integration branch and run-owned worktrees are allowed; note them instead of treating them as an automatic blocker
- Inspect `git worktree list` for stale worktrees. Extra worktrees are a blocker only when they are unexpected for the current run state

### Build health

- `pnpm run build` passes

### Active run conflict

- If `.anvil/ACTIVE_RUN` exists and points to a different slug:
  - read that run's `status.json`
  - if `active = true`, block and tell the operator to pause or complete it first
  - if `active = false`, proceed

### Credentials

Use request metadata or an existing `bundle.json` when available to decide whether API credentials are required.

- `gh auth status` succeeds only when the run needs GitHub issue intake, GitHub-backed verification, or another GitHub-authenticated surface
- if the run needs Linear-backed verification or external issue flow, `LINEAR_API_KEY` must be set and non-empty

### Docker

If bundle metadata or the verification plan says the run needs orchestrator, worker, sandbox, or lifecycle E2E behavior:

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
