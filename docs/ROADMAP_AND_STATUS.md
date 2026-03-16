# Roadmap and Status

This document is the public-facing status snapshot for the current Symphony repository. It is intentionally factual: it describes what is already implemented, what the current scope is, and what major gap remains.

## Current release baseline

The repository is currently at `0.1.0` in `package.json` and already implements a working local orchestration loop for Linear-driven Codex work.

## What is achieved so far

### Core runtime

- Workflow loading and config validation
- Workflow file reload with last-known-good fallback
- Local CLI entrypoint and built binary wrapper
- Local archive directory selection with `--log-dir`

### Issue orchestration

- Linear polling for candidate issues
- Per-issue workspace creation and cleanup
- Workspace lifecycle hooks with timeout enforcement
- Retry handling with bounded backoff
- Shutdown handling and non-retriable hard-failure handling
- Stall detection for long-silent workers

### Codex worker integration

- `codex app-server` process orchestration
- JSON-RPC initialization and thread/turn lifecycle handling
- Authentication preflight via `account/read`
- Rate limit preflight via `account/rateLimits/read`
- Dynamic `linear_graphql` tool exposure to the worker
- Per-issue model override selection saved by the operator

### Operator visibility

- Local dashboard at `/`
- JSON API for state, issue detail, attempt listing, attempt detail, refresh, and model override updates
- Aggregate token accounting in the runtime snapshot
- Recent event visibility for active work
- Durable archived attempts and per-attempt event timelines under `.symphony/`

### Validation

- Deterministic Vitest unit coverage
- Fixture-driven protocol tests for the agent runner
- Opt-in live integration test path

## Current operating scope

Symphony is currently meant for local, operator-controlled use on a single host. It is a practical orchestration tool for watching Linear, launching Codex workspaces locally, and inspecting live or archived work through the dashboard and API.

## Remaining major roadmap gap

The largest remaining gap relative to the broader upstream-style vision is multi-host worker distribution over SSH. The current codebase launches workers on the local machine only.

## Smaller follow-up opportunities

These are not blockers for `v0.1.0`, but they are reasonable follow-up areas:

- further dashboard polish
- stronger release automation
- replacing remote dashboard CDN assets with fully local static assets
- richer operator reporting and release metadata

## How to keep this document current

Update this file when the shipped operator surface changes. If a capability is not implemented in the code or exposed in the actual runtime, do not list it here as achieved.
