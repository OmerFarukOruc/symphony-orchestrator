# TODOS

## Orchestrator

### P2 — Multi-cloud execution layer
**What:** `SandboxProvider` interface with Docker, E2B, Daytona, local adapters.

**Why:** Agents could run in cloud sandboxes without local infrastructure. Enables true lights-out operation in the cloud.

**Pros:**
- Run agents without local machine
- Cloud-native deployment option
- Potential for multi-region execution

**Cons:**
- Significant complexity (new abstraction layer)
- Requires cloud account setup
- Security model changes (cloud credentials)

**Context:** Deferred from CEO review (2026-03-22) — not blocking lights-out operation on local machine. The current Docker sandbox provides local isolation; multi-cloud is a future enhancement for hosted deployment.

**Depends on:** Docker sandbox implementation (#56) — provides the interface pattern.

**Status:** Deferred

---

## Completed

*No completed items yet.*