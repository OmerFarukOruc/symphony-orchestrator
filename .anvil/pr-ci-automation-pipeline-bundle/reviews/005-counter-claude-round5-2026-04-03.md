---
plan: feat: PR/CI Automation Pipeline Bundle
round: 5
mode: counter-review
model: claude-round5
date: 2026-04-03
previous: reviews/004-hostile-audit-claude-2026-04-03.md
verdict: CONDITIONAL GO
confidence: 93%
overall_score: 8.3/10
---

## What Works

The hostile audit performed the most important service of the review cycle: it ran the
actual SQLite syntax and caught a shared blind spot that four rounds of textual reasoning
missed. The two reopened points are genuine blockers with real code evidence — not
quibbles over style or severity. Both have deterministic fixes available in the codebase
pattern set. The 10 clean settlements remain solid and do not need re-examination.

## Settled Points (16 items — not re-evaluated)

See ledger.md. All 16 prior settled points stand. This round addresses only the 2
reopened blockers: NEW-3 and ISSUE-1.

---

## Reopened Points

### REOPEN-A (was NEW-3): `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` not valid SQLite

**Verdict**: AGREE — this is a genuine blocker. The hostile auditor's evidence is correct.

**Their claim**: `ALTER TABLE attacks ADD COLUMN summary TEXT IF NOT EXISTS` throws a
syntax error on SQLite 3.50.2. The `IF NOT EXISTS` clause does not exist for `ADD COLUMN`
in any SQLite release.

**My assessment (with codebase evidence)**:

Verification across the entire Risoluto source tree confirms zero `ALTER TABLE` statements
exist anywhere in `src/` or `tests/`. The `database.ts` migration block is:

```typescript
if (!versionRow || versionRow.version < 3) {
  sqlite.prepare("INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)")
    .run(3, new Date().toISOString());
}
```

This writes **only** a version row — no schema mutations at all. There are no `PRAGMA
table_info` calls, no `ALTER TABLE` statements, and no try/catch migration guards anywhere
in the persistence layer. This means:

1. Every column added since v1 (`workspace_key`, `workspace_path`, `stop_signal`,
   `reasoning_effort`, `model_source`, `attempt_number`, `pull_request_url`) is present
   only in `CREATE TABLE IF NOT EXISTS` DDL. Existing databases that were created before
   those columns were added would be silently missing them — the system has relied on fresh
   deploys or manual DB recreation, not genuine migrations.

2. The `summary` column faces the same problem. A v1 database opened by the new code will
   silently lack `summary`. Any attempt to read or write that column will fail at runtime.

3. The `IF NOT EXISTS` wording in the round-4 settlement was accepted by both prior
   reviewers without SQLite documentation lookup. The SQLite grammar for `ADD COLUMN` is:
   `ALTER TABLE table-name ADD COLUMN column-def` — there is no optional `IF NOT EXISTS`
   modifier.

**Concrete fix — two valid options, pick one:**

**Option 1 — try/catch on `duplicate column name` (preferred for this codebase):**

```typescript
// In openDatabase(), after the v3 version seed, bump to v4:
if (!versionRow || versionRow.version < 4) {
  try {
    sqlite.exec("ALTER TABLE attempts ADD COLUMN summary TEXT");
  } catch (err: unknown) {
    // SQLite error message for adding an existing column:
    // "table attempts already has a column named summary"
    // Suppress this specific error; rethrow anything else.
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already has a column named summary")) {
      throw err;
    }
  }
  sqlite
    .prepare("INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)")
    .run(4, new Date().toISOString());
}
```

**Option 2 — `PRAGMA table_info` pre-check:**

```typescript
if (!versionRow || versionRow.version < 4) {
  const cols = sqlite
    .prepare("PRAGMA table_info(attempts)")
    .all() as Array<{ name: string }>;
  const hasSummary = cols.some((col) => col.name === "summary");
  if (!hasSummary) {
    sqlite.exec("ALTER TABLE attempts ADD COLUMN summary TEXT");
  }
  sqlite
    .prepare("INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)")
    .run(4, new Date().toISOString());
}
```

**Recommendation**: Option 1 (try/catch) is preferred because:
- It is atomic: the version row only advances when the `ALTER TABLE` either succeeds or
  is confirmed redundant.
- It handles concurrent startup races implicitly (second process catches the duplicate
  and skips cleanly).
- It does not require a full table scan of metadata before the write.
- The error message `"table X already has a column named Y"` is stable SQLite behavior
  (not version-dependent).

The plan's U1 approach text must replace **all references** to `ADD COLUMN IF NOT EXISTS`
with the try/catch pattern. U1 test scenarios must add: "Migration guard: running
`openDatabase()` on a v3 database (without `summary` column) succeeds and adds the column;
running again on a v4 database succeeds without error."

**Status**: → Settled. Fix: try/catch on `duplicate column name` in v4 migration block.
Do not use `IF NOT EXISTS`. Do not use `PRAGMA table_info` (both work; try/catch is
tighter). Update U1 approach and test scenarios.

---

### REOPEN-B (was ISSUE-1): U4 plan text never updated + `-o /dev/stdout` output-mixing risk

**Verdict**: AGREE — both sub-claims are correct. The plan body for U4 still describes the
wrong mechanism, and the hostile auditor correctly identified `-o /dev/stdout` as producing
mixed output.

**Their claim (3 parts)**:
1. `-o /dev/stdout` causes output mixing: TUI/progress output and the file-write are both
   on stdout.
2. U4 plan body was never updated — still says `generatePrSummary(workspaceDir,
   defaultBranch, apiKey)` with "Claude API call" language.
3. The project already has working `codex exec --json` + JSONL infrastructure in
   `codex-session-runner.ts`.

**My assessment (with codebase evidence)**:

**Sub-claim 1 (output mixing)**: Confirmed correct. `codex exec -o /dev/stdout` opens
`/dev/stdout` as a file path with `O_WRONLY` and writes the last message there. Because
`codex exec` also writes JSONL events (or TUI progress) to its own stdout, the parent
process capturing stdout receives an interleaved stream. This is not "clean last-message
extraction." The `-o` flag is designed for writing to a named file on disk, not for piped
output capture. Sub-claim is valid.

**Sub-claim 2 (plan text not updated)**: Reading U4 in `plan.md` (lines 355–381)
confirms the text still contains:
- `generatePrSummary(workspaceDir, defaultBranch, apiKey)` — `apiKey` parameter present
- "feeds the diff to a single-turn Claude API call" (line 356)
- "Error path: Claude API call fails → returns `null`, does not throw." (line 371)

The round-4 settlement explicitly required these to be updated. They were not. An
implementer following `plan.md` will build a direct Claude SDK invocation, not a
`codex exec` subprocess.

**Sub-claim 3 (existing `codex-session-runner.ts` infrastructure)**: Verified. The
pattern lives at `.claude/skills/gstack/test/helpers/codex-session-runner.ts`. The
invocation is:

```typescript
const args = ['exec', prompt, '--json', '-s', sandbox];
// stdout is piped; JSONL lines collected from streaming reader
```

The JSONL parser (`parseCodexJSONL`) handles all event types:
- `thread.started` → session ID
- `item.completed` with `item.type === 'agent_message'` → **this is the final assistant text**
- `turn.completed` → token usage

The final assistant message is assembled from all `agent_message` items joined with `\n`.
For a single-turn summary invocation (capped at 1 turn), there will be exactly one
`agent_message` event — the summary text.

**Concrete fix — exact U4 approach replacement text:**

Replace the current U4 approach block with:

```
generatePrSummary(workspaceDir, defaultBranch):
  1. Runs `git diff {defaultBranch}...HEAD` via `child_process.execFile('git',
     ['diff', `${defaultBranch}...HEAD`], { cwd: workspaceDir })`.
  2. Spawns `codex exec {prompt} --json -s read-only` as a child process with
     stdout piped, following the pattern in
     `.claude/skills/gstack/test/helpers/codex-session-runner.ts`.
     - No `-o` flag. No `apiKey` parameter. No Claude SDK import.
     - The prompt is the strict flat-bullet instruction (3–8 bullets, no headings,
       no intro) with the `git diff` output appended inline.
  3. Streams JSONL lines from stdout. Parses using the `parseCodexJSONL`
     logic: collect all `item.completed` events where `item.type ===
     'agent_message'`; join their `item.text` values. This is the summary string.
  4. Returns the joined text, or `null` if the process exits non-zero, the diff
     is empty, or no `agent_message` events are emitted.

Function signature: `generatePrSummary(workspaceDir: string, defaultBranch: string):
  Promise<string | null>`

No `apiKey` parameter. No Claude SDK import. No `--ephemeral` flag (not needed for
a stateless single-turn invocation with no sandbox write access). Use `-s read-only`.
```

U4 test scenarios must also be updated:
- Replace: "Error path: Claude API call fails → returns `null`"
- With: "Error path: `codex exec` exits non-zero → returns `null`, does not throw."
- Replace: "Happy path: `generatePrSummary` returns 3–8 bullet string from mocked
  Claude response."
- With: "Happy path: `generatePrSummary` returns 3–8 bullet string parsed from mocked
  JSONL `agent_message` event."

**Status**: → Settled. Fix:
1. Remove `apiKey` parameter from `generatePrSummary` signature everywhere in U4.
2. Replace "Claude API call" language with `codex exec --json -s read-only` subprocess
   pattern with piped stdout JSONL parsing.
3. Extract assistant message from `item.completed` events where `item.type ===
   'agent_message'`.
4. Update U4 test scenarios to mock JSONL output, not a Claude SDK response.

---

## Additional Issues Found

The hostile audit's 4 remaining warnings (ISSUE-2 migration audit gap, ISSUE-13 builder
pattern ambiguity, U6 `auto_archive` scope creep, ISSUE-8 stale runtime state race) were
labeled "sharpen" not "reopen." They are correctly scoped as implementation-time constraints
rather than plan-level blockers. No additional re-evaluation needed for this round.

One addendum on ISSUE-2 (migration audit gap, raised as warning by hostile auditor):
now that we have confirmed zero `ALTER TABLE` statements exist in the codebase, the hostile
auditor's framing is correct: the `summary` column cannot be treated in isolation. The v4
migration block in the concrete fix above handles only `summary`. U1 should include a note:
"A follow-up issue should audit all columns in `CREATE_TABLES_SQL` that post-date the v1
schema to confirm whether existing production databases need additional `ALTER TABLE`
guards." This is a documentation note, not an implementation blocker for this bundle.

---

## Revised Scores

| Dimension | Round 4 | Round 5 | Delta | Notes |
|-----------|---------|---------|-------|-------|
| Completeness | 8 | 8 | 0 | U4 text still needs rewrite; plan.md not yet updated |
| Sequencing & Dependencies | 9 | 9 | 0 | No change |
| Risk Coverage | 7 | 8 | +1 | Both migration and summary-gen risks now have concrete fixes |
| Feasibility | 8 | 8 | 0 | No change |
| Edge Cases | 7 | 8 | +1 | Migration idempotence edge case now handled |
| UX & Design Quality | N/A | N/A | — | Backend-only plan |
| Accessibility & Responsiveness | N/A | N/A | — | Backend-only plan |
| Clarity | 8 | 7 | -1 | U4 approach text is still wrong in plan.md — misleads implementer |
| Scope Discipline | 9 | 9 | 0 | No change |
| ROI / Effort | 9 | 9 | 0 | No change |
| Goal Alignment | 9 | 9 | 0 | No change |

**Overall**: 8.3/10 (up from 8.1 — blockers now have concrete fixes; held back by U4
approach text still requiring a plan.md edit before execution).

---

## Verdict

**CONDITIONAL GO — 93%**

Both reopened blockers are now settled with specific, evidence-grounded fix language:

1. **NEW-3 / REOPEN-A**: Use try/catch on `"already has a column named summary"` error
   in a v4 migration block. No `IF NOT EXISTS`. Plan.md U1 approach must reflect this.

2. **ISSUE-1 / REOPEN-B**: Use `codex exec --json -s read-only` with piped stdout JSONL
   parsing, following `codex-session-runner.ts`. Remove `apiKey` parameter. Remove all
   "Claude API call" language from U4. Plan.md U4 approach must reflect this before
   execution begins.

The plan is ready to finalize (Phase 4) once `plan.md` is updated to reflect both fixes.
The 4 remaining hostile-audit warnings (ISSUE-2, ISSUE-13, U6, ISSUE-8) are
implementation-time sharpening notes — they do not block finalization.

**Contested / Open**: 0
