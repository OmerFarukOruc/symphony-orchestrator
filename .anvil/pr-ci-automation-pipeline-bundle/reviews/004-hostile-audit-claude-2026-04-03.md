---
plan: feat: PR/CI Automation Pipeline Bundle
type: hostile-audit
model: hostile-auditor
date: 2026-04-03
round: 5
---

## Hostile Audit Results

### Summary
- Settlements audited: 16
- Clean: 10
- Flagged: 6 (irreversible-premise: 1, shared-blind-spot: 2, compromise: 1, same-arrangement: 1, no-improvement: 1)

---

### Clean Settlements (10 items)

ISSUE-3, ISSUE-4, ISSUE-6, ISSUE-7, ISSUE-8, ISSUE-9, ISSUE-11, ISSUE-10, ISSUE-12, ISSUE-14 passed all five checks. The reasoning is traceable to concrete code evidence, the choices are genuine engineering decisions rather than splits, and the status-quo comparison is favorable.

---

### Flagged Settlements

#### NEW-3 — Fresh-install trap in schema migration
**Flag**: irreversible-premise  
**Evidence**: Settlement states "SQLite version 3.50.2 on this system (above 3.37 threshold). `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is available and idempotent." Actual test on the reported 3.50.2 system:

```
$ python3 -c "
import sqlite3
conn = sqlite3.connect(':memory:')
conn.execute('CREATE TABLE attempts (attempt_id TEXT, status TEXT)')
conn.execute('ALTER TABLE attempts ADD COLUMN IF NOT EXISTS summary TEXT')
"
ERROR: near "EXISTS": syntax error
```

`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is **NOT supported** by SQLite 3.50.2. The SQLite documentation does not list this syntax at all — it is not a feature of any SQLite release. Both reviewers accepted the `IF NOT EXISTS` claim without verifying it, and the settlement is now a blocker: any implementation that follows this directive will crash on startup for both fresh installs and upgrades.

**The real fix**: the correct idempotent pattern is to catch the `duplicate column name` error (SQLite error code 1, message `"table attempts already has a column named summary"`), or to run `PRAGMA table_info(attempts)` first and skip the `ALTER TABLE` if the column exists. Both patterns are used in other SQLite migration codebases. Neither reviewer proposed either approach — this is a genuine shared blind spot that slipped through four rounds.

**Recommendation**: reopen  
**Severity**: blocker  
**Suggested reframing**: "The migration must use a try/catch around `ALTER TABLE attempts ADD COLUMN summary TEXT` and suppress the `duplicate column name` error, or read `PRAGMA table_info(attempts)` to check column existence before executing the `ALTER TABLE`. `IF NOT EXISTS` is not valid SQLite syntax and must not be used."

---

#### ISSUE-1 — Summary-generation mechanism gap (`codex exec --ephemeral -o /dev/stdout`)
**Flag**: irreversible-premise + shared-blind-spot  
**Evidence**: The settlement resolves ISSUE-1 by declaring "`codex exec --ephemeral -o /dev/stdout` subprocess pattern is the correct implementation," dismissing the JSONL approach as unnecessary. Three problems:

1. **The `-o FILE` flag opens a file path and writes the last message there.** Using `/dev/stdout` as the file path means `codex exec` will `open("/dev/stdout", O_WRONLY)` and write the last message. Meanwhile, `codex exec` itself also emits progress information to its stdout (the terminal rendering, the agent's inline output, or without `--json` the interactive TUI output). The parent process capturing stdout will receive a mix of TUI/progress output AND the `-o` last-message write — not "clean last-message extraction." If `--json` is also added, the parent receives JSONL events interleaved with the `-o` write.

2. **The settlement's supporting claim that "`--json` flag confirmed by live `codex exec --help`" is true**, but the JSONL approach (which is what `--json` enables) is exactly what the project's own `codex-session-runner.ts` helper uses, where it is described as the established pattern for capturing codex output: `const args = ['exec', prompt, '--json', '-s', sandbox]` with stdout piped. Both reviewers agreed to abandon `--json` without considering that the project already has working infrastructure for JSONL parsing.

3. **The plan body for U4 was never updated.** U4 still says `generatePrSummary(workspaceDir, defaultBranch, apiKey)` with "Claude API call" language throughout (lines 356, 368, 371). The settlement instructs "U4 approach must remove `apiKey` parameter and replace 'Claude API call' text" but this retrofit was not applied to the plan. An implementer following the plan.md (not the ledger) will implement a Claude SDK call, not a `codex exec` subprocess.

**Recommendation**: reopen  
**Severity**: blocker  
**Suggested reframing**: "Use `codex exec --ephemeral --json -s read-only` (without `-o`) and capture stdout JSONL, following the pattern established in `codex-session-runner.ts`. Parse the last `agent_message` from `item.completed` events. Update the U4 plan body to replace all 'Claude API call' / `apiKey` language with the `codex exec --json` subprocess pattern, including updated test scenarios."

---

#### ISSUE-2 — Schema migration gap for `summary` column
**Flag**: shared-blind-spot  
**Evidence**: The settlement correctly identifies that `database.ts` only applies create-only SQL and that the `summary` column needs an `ALTER TABLE` migration. However, both reviewers focused entirely on the `summary` column and never asked: **are there other columns that have already been added to `CREATE_TABLES_SQL` without a corresponding `ALTER TABLE` migration for existing databases?**

The current `database.ts` has a schema at version 3 with a seeding check (`if (!versionRow || versionRow.version < 3)`) that only writes the version row — it runs **zero `ALTER TABLE` statements**. This means every column currently in `CREATE_TABLES_SQL` that did not exist in the v1/v2 schema would be missing from existing databases unless the schema was recreated. There is no migration code at all for any column additions.

This is a systemic problem: the migration infrastructure is incomplete regardless of the `summary` column. Adding the `summary` column migration correctly requires first understanding how existing databases were migrated for `pull_request_url`, `stop_signal`, `reasoning_effort`, `model_source`, `attempt_number`, `workspace_key`, `workspace_path` and similar columns that were presumably added over time. The plan does not address this: it treats the `summary` column as an isolated migration without auditing the migration gap for all other newer columns.

**Recommendation**: sharpen  
**Severity**: warning  
**Suggested reframing**: "Before implementing the `summary` column migration, audit the existing `attempts` table columns against the v1 schema (which was `attempt_id, issue_id, issue_identifier, title, status, started_at, model, thread_id, turn_id, turn_count, error_code, error_message, input_tokens, output_tokens, total_tokens`). Any column in the current `CREATE_TABLES_SQL` not in v1 requires an `ALTER TABLE` migration guard for existing databases. The plan must include a migration audit, not just the `summary` column fix."

---

#### ISSUE-13 — Runtime config plumbing missing from U1 (`builders.ts`)
**Flag**: same-arrangement  
**Evidence**: The settlement is framed as a round-4 discovery, but what it actually settles is: "TypeScript WILL catch this at the `deriveServiceConfig()` return statement (because `AgentConfig` type will include the new fields)." This is correct: changing `AgentConfig` to `z.infer<typeof agentConfigSchema>` and not updating `deriveAgentConfig()` will produce a TypeScript error. The settlement says this is acceptable because both files are in U1's scope.

The concern: this framing relies on TypeScript's type checker being the only safety net for a runtime correctness issue. If the type check passes (i.e., `deriveAgentConfig()` is updated to return all fields), that does not prove the new config values are wired correctly through the builder. The `deriveAgentConfig()` function hardcodes defaults (e.g., `asNumber(agent.stall_timeout_ms, 1200000)`) — the same pattern must be applied for `autoRetryOnReviewFeedback`, `prMonitorIntervalMs`, and `autoMerge`. The settlement mentions both files are required, but does not state what the builder additions look like.

This is not a blocker (TypeScript catches the omission), but the settlement accepts "TypeScript will catch it" as the resolution without specifying the builder mapping pattern. A future reviewer could satisfy TypeScript with `autoRetryOnReviewFeedback: asBoolean(agent.auto_retry_on_review_feedback, false)` or equivalently `agentConfigSchema.parse(agent)` — which are fundamentally different approaches (one preserves the field-by-field builder pattern, the other parses and potentially loses camelCase→snake_case translation).

**Recommendation**: sharpen  
**Severity**: warning  
**Suggested reframing**: "U1 must add the builder mappings explicitly: `autoRetryOnReviewFeedback: asBoolean(agent.auto_retry_on_review_feedback, false)`, `prMonitorIntervalMs: asNumber(agent.pr_monitor_interval_ms, 60000)`, and `autoMerge: deriveMergePolicyConfig(asRecord(agent.auto_merge))` following the existing field-by-field pattern. Do NOT replace the builder with `agentConfigSchema.parse()` — that bypasses secret resolution and the `asRecord`/`asNumber` tolerance layer."

---

#### U6 — `auto_archive` per-issue flag (undocumented setting)
**Flag**: no-improvement  
**Evidence**: The U6 approach states: "On merge: if `config.agent.autoMerge.enabled` or a per-issue `auto_archive` flag is set, calls `attemptStore.updateAttempt()` and `workspaceManager.removeWorkspace()`." The `per-issue auto_archive flag` appears nowhere in: the config schema additions (U1), the `IssueConfig` table, the `PrRecord` type, or the plan's requirements (R23–R27). R25 says "if configured" and R26 says "when auto-archive enabled" — but neither specifies a per-issue mechanism.

Both reviewers passed through U6 without questioning whether `auto_archive` is a global setting (under `auto_merge`) or a per-issue setting (where?). The plan's risk table refers to "Disable `auto_archive` in config" as the rollback — implying it is a config-level setting, not per-issue. But the U6 approach text creates an implementation detail that is not covered by any settled point. An implementer will need to invent the mechanism or treat it as `config.agent.autoMerge.enabled` only.

**Recommendation**: sharpen  
**Severity**: warning  
**Suggested reframing**: "Remove `per-issue auto_archive flag` from U6's merge trigger condition. The archive-on-merge trigger should be: `config.agent.autoMerge.enabled === true`. A per-issue override mechanism is not in scope for this bundle and has no schema definition. If per-issue override is desired, add `autoArchiveOnMerge` to `IssueConfig` in a separate issue."

---

#### ISSUE-8 — Auto-retry race condition (the race is more complex than the settlement acknowledges)
**Flag**: shared-blind-spot  
**Evidence**: The settlement says "`poll()` auto-retry path needs `status !== "running"` guard." This is correct as far as it goes. Neither reviewer raised the secondary race: **the `poll()` auto-archive path calls `attemptStore.updateAttempt(attemptId, { status: "completed" })` (the archive step) while the orchestrator's reconciliation loop may independently be reading that attempt's status to make scheduling decisions.**

The orchestrator's `start()` polling loop reads attempt statuses to determine available concurrency slots. If `PrMonitorService.poll()` sets an attempt to `"completed"` outside the orchestrator's normal completion path (`handleStopSignal` → `prepareWorkerOutcome`), the orchestrator's internal `RunningEntry` map is NOT updated — it still has the attempt in its running set. This could cause a slot leak (the orchestrator thinks an agent is still running) or a duplicate completion event.

The settlement addresses the "active worker" race but not the "stale runtime state" race. The `status !== "running"` guard prevents overwriting a running attempt, but a `"completed"` status set by `PrMonitorService` will not remove the attempt from the orchestrator's `runningByIssue` map, potentially leaving a ghost entry.

**Recommendation**: accept-with-risk  
**Severity**: warning  
**Suggested reframing**: "The ISSUE-8 guard is necessary but not sufficient. Add a note: `PrMonitorService.updateAttempt()` on merge must only update the DB record. It must NOT attempt to clean up orchestrator runtime state — that state is managed exclusively by the orchestrator's `handleStopSignal`/`handleCancelledOrHardFailure` paths. If the attempt has already been through those paths (status is `"completed"` or `"failed"`), the DB update is safe. Document this constraint in the PR monitor implementation."

---

### Shared Assumptions (both reviewers missed)

- **`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` exists in SQLite**: Both reviewers accepted this claim in rounds 2 and 4 without verifying it. The syntax does not exist in any SQLite version. The correct pattern (try/catch on duplicate column, or PRAGMA table_info pre-check) was available to both models but never mentioned. This is the most dangerous shared blind spot because it turns a runtime crash into a silent implementation error — the code will look correct, compile, pass unit tests, and then crash on any existing database at startup.

- **`-o /dev/stdout` produces clean output**: Both reviewers accepted that writing the last message to `/dev/stdout` via the file path produces output that can be reliably captured by the parent process as the model's final response. Neither considered that `codex exec` also emits to stdout (TUI, progress, or JSONL events if `--json` is added). Neither referenced the existing `codex-session-runner.ts` infrastructure in the project itself, which implements the correct pattern (`--json` + JSONL parsing from piped stdout) and is actively used in integration tests.

- **The migration system is complete**: Both reviewers treated the `summary` column migration as an isolated problem without asking whether the existing migration infrastructure is actually functional. There are no `ALTER TABLE` statements in `database.ts` at all — only a version-row seed. Neither reviewer asked "how did the `pull_request_url`, `stop_signal`, or `reasoning_effort` columns get into existing databases if there's no migration code?" This question would have revealed the systemic migration gap.

- **`auto_archive` per-issue flag is defined**: Both reviewers read through U6's approach without flagging the undefined `per-issue auto_archive flag` as a scope gap. Requirements R25–R26 define archive-on-merge as a configurable global behavior, but neither reviewer questioned the plan's introduction of a per-issue variant that has no schema, no config key, and no implementation path.

- **60s polling is the right default for this use case**: Both reviewers accepted 60s polling without questioning whether it's optimal. The actual concern is not latency (PR review takes hours) but **GitHub API rate limit consumption at higher concurrency**. At the configured default of `maxConcurrentAgents: 10`, 60s polling consumes ~600 GitHub API calls/hour for PR monitoring alone (10 open PRs × 60 polls/hour). If operators configure higher concurrency (e.g., 50 agents), this becomes ~3000 calls/hour (60% of the 5000/hr authenticated rate limit), leaving only 40% for PR creation, review fetching, merge requests, and all other GitHub operations. The plan's risk table mentions "60s is acceptable per requirements" but does not compute the rate limit impact at non-default concurrency.

---

### Verdict

**REOPEN 2**

Two settlements require re-examination before finalization:

1. **NEW-3** (blocker): `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is not valid SQLite syntax. The settlement directs implementers toward a pattern that will crash existing databases. This must be corrected before implementation begins.

2. **ISSUE-1** (blocker): The plan body for U4 still contains the old "Claude API call" / `apiKey` approach. The settlement's directive to update U4 was not applied. An implementer following plan.md will implement the wrong mechanism. The `-o /dev/stdout` approach also has an unverified output-mixing risk; the project's existing `codex-session-runner.ts` pattern (`--json` + piped stdout) is the safer, already-validated approach.

The remaining 4 flagged items (ISSUE-2 migration audit gap, ISSUE-13 builder pattern ambiguity, U6 `auto_archive` scope creep, ISSUE-8 stale runtime state race) are warnings that should be addressed as sharpening notes during finalization — they do not require a full debate round.
