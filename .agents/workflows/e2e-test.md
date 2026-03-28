---
description: Run a full Symphony E2E test — create a Linear issue, start the orchestrator, verify the agent completes, validate persisted attempt data, confirm GitHub PR creation, and prove restart resilience (no re-dispatch on restart).
---

// turbo-all

# Symphony E2E Test Playbook

Tests the full Symphony lifecycle end-to-end. Follow each phase in order. Every check must pass before proceeding.

---

## Known Constants

These IDs are stable and pre-discovered. Use them directly in the steps below. Only re-query if a step fails unexpectedly.

| Name                 | Value                                    |
| -------------------- | ---------------------------------------- |
| NIN team ID          | `84f97131-06b9-49e5-a494-66f6e18a383a`   |
| Project slug         | `symphony-e2e-test-c36e46913595`         |
| Project ID           | `e0cfcbde-1a95-4726-8161-3eabd289c75a`   |
| In Progress state ID | `4e9f32d8-a5e6-4f86-9f54-d4cf31aede29`   |
| Done state ID        | `941e87a9-6bd6-40bd-9ca3-e97fc680b719`   |
| GitHub repo          | `OmerFarukOruc/symphony-orchestrator`    |
| Codex working dir    | `/home/oruc/Desktop/codex`               |
| Workspace root       | `/home/oruc/Desktop/symphony-workspaces` |
| Attempt archive dir  | `/home/oruc/Desktop/codex/.symphony`     |

---

## Phase 1: Environment Checks

### 1.1 Verify required environment variables

```bash
echo "=== Environment Check ===" && \
  [ -n "$LINEAR_API_KEY" ] && echo "✅ LINEAR_API_KEY set" || echo "❌ LINEAR_API_KEY missing" && \
  [ -n "$OPENAI_API_KEY" ] && echo "✅ OPENAI_API_KEY set" || echo "❌ OPENAI_API_KEY missing" && \
  gh auth token >/dev/null 2>&1 && echo "✅ GitHub CLI authenticated" || echo "❌ gh auth not available"
```

**STOP if any are missing.** Tell the user which vars need to be set and do not proceed.

### 1.2 Build and run tests

```bash
cd /home/oruc/Desktop/codex && npm run build 2>&1 | tail -5
```

```bash
cd /home/oruc/Desktop/codex && npm test 2>&1 | tail -5
```

**STOP if build fails or any tests fail.** Report the failures to the user.

---

## Phase 2: Linear Issue Setup

### 2.1 Create a new test issue

Use the pre-discovered constants. Pick a simple, deterministic task the agent can complete in one turn — something that produces a verifiable file or commit.

```bash
TEAM_ID="84f97131-06b9-49e5-a494-66f6e18a383a"
IN_PROGRESS_STATE_ID="4e9f32d8-a5e6-4f86-9f54-d4cf31aede29"
PROJECT_ID="e0cfcbde-1a95-4726-8161-3eabd289c75a"

curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { issueCreate(input: { teamId: \\\"$TEAM_ID\\\", title: \\\"Add .editorconfig for consistent formatting\\\", description: \\\"Create a .editorconfig file at the root of the repository with standard settings for TypeScript/JavaScript projects:\\\\n\\\\n* UTF-8 charset\\\\n* LF line endings\\\\n* 2-space indentation for .ts, .js, .json, .md files\\\\n* Trim trailing whitespace\\\\n* Insert final newline\\\\n\\\\nThis aligns with the existing code style (2-space indent, double quotes, semicolons).\\\", stateId: \\\"$IN_PROGRESS_STATE_ID\\\", projectId: \\\"$PROJECT_ID\\\" }) { success issue { id identifier url } } }\"}" | python3 -m json.tool
```

Save these three values from the response — you will use them throughout the playbook:

- `ISSUE_UUID` — the `id` field (full UUID)
- `ISSUE_ID` — the `identifier` field (e.g. `NIN-15`)
- `ISSUE_URL` — the `url` field

---

## Phase 3: Start Symphony

### 3.1 Kill stale processes and clean workspace

```bash
ISSUE_ID="<identifier_from_2.1>"   # e.g. NIN-15
fuser -k 4000/tcp 2>/dev/null
sleep 1
rm -rf "/home/oruc/Desktop/symphony-workspaces/$ISSUE_ID"
rm -f /home/oruc/Desktop/codex/.symphony/secrets.enc /home/oruc/Desktop/codex/.symphony/secrets.audit.log
echo "Ready — port 4000 free, workspace clean, secrets cleared"
```

### 3.2 Start the orchestrator (backgrounded)

Start Symphony in the background and capture its PID and log file path. You will use both for monitoring and cleanup.

```bash
export GITHUB_TOKEN="$(gh auth token)"
export LINEAR_PROJECT_SLUG="symphony-e2e-test-c36e46913595"
export MASTER_KEY="e2e-test-key"
export LOG_FILE="/tmp/symphony-e2e-$(date +%s).log"

cd /home/oruc/Desktop/codex && \
  node dist/cli/index.js ./WORKFLOW.md --port 4000 > "$LOG_FILE" 2>&1 &
SYMPHONY_PID=$!

echo "Symphony PID=$SYMPHONY_PID  LOG=$LOG_FILE"
sleep 3
grep -E "service started|error" "$LOG_FILE" | head -5
```

**Verify startup:** the log should contain `"service started"` within 5 seconds.

### 3.3 Verify agent pickup

```bash
sleep 20
grep -E "issueIdentifier|dispatch|worker_started|codex stderr" "$LOG_FILE" | head -10
```

**Verify agent pickup:** look for lines referencing `$ISSUE_ID` (e.g. `NIN-15`) within 30 seconds of startup.

---

## Phase 4: Monitor Agent Execution

### 4.1 Wait for completion (max 3 minutes)

Poll the API every 15 seconds until the issue appears in the `completed` list:

```bash
ISSUE_ID="<identifier_from_2.1>"

for i in $(seq 1 12); do
  # nosemgrep: skills.command-execution.skill-curl-silent-pipe.skill-curl-silent-pipe
  RESULT=$(curl -s http://127.0.0.1:4000/api/v1/state | python3 -c "
import json, sys
d = json.load(sys.stdin)
running = [(r.get('identifier'), r.get('status')) for r in d.get('running', [])]
completed = [(c.get('identifier'), c.get('status')) for c in d.get('completed', [])]
print(f'Running: {running}')
print(f'Completed: {completed}')
if any(c[0] == '$ISSUE_ID' for c in completed):
    print('DONE')
")
  echo "[$(date +%H:%M:%S)] $RESULT"
  echo "$RESULT" | grep -q "DONE" && break
  sleep 15
done
```

### 4.2 Verify key log lines

Check the log file for the expected completion signals:

```bash
echo "=== DONE signal ==="
grep -E "stopSignal|stop.signal|SYMPHONY_STATUS" "$LOG_FILE" | tail -5

echo "=== PR creation ==="
grep -E "pull request created|pullRequestUrl|github.com" "$LOG_FILE" | tail -5
```

Expected lines:

- `"post-reconciliation stop-signal check" ... stopSignal="done"` — DONE signal was detected
- `"pull request created" ... url="https://github.com/..."` — PR was created and URL was logged

---

## Phase 5: Validate Results

### 5.1 Check API state

```bash
# nosemgrep: skills.command-execution.skill-curl-silent-pipe.skill-curl-silent-pipe
curl -s http://127.0.0.1:4000/api/v1/state | python3 -c "
import json, sys
d = json.load(sys.stdin)
running = d.get('running', [])
completed = d.get('completed', [])

print('=== RESULTS ===')
errors = []

if running:
    errors.append(f'❌ Running should be empty, got {len(running)} entries: {[r.get(\"identifier\") for r in running]}')
else:
    print('✅ No running agents')

if not completed:
    errors.append('❌ No completed issues found')
else:
    c = completed[0]
    status = c.get('status', 'unknown')
    ident = c.get('identifier', 'unknown')
    print(f'✅ Issue {ident} status: {status}')
    if status != 'completed':
        errors.append(f'❌ Expected status=completed, got {status}')

events = d.get('recent_events', [])
turn_completes = [e for e in events if e.get('event') == 'turn_completed']
print(f'ℹ️  Turn count: {len(turn_completes)}')

done_events = [e for e in events if 'SYMPHONY_STATUS: DONE' in (e.get('content') or '')]
if done_events:
    print('✅ SYMPHONY_STATUS: DONE detected in agent output')
else:
    errors.append('❌ No SYMPHONY_STATUS: DONE found in events')

for err in errors:
    print(err)
print()
print('VERDICT: ❌ FAIL' if errors else 'VERDICT: ✅ ALL CHECKS PASSED')
"
```

### 5.2 Verify attempt JSON (persisted fields)

This checks that `pullRequestUrl` and `stopSignal` are stored in the archived attempt record — not just in memory.

```bash
ISSUE_ID="<identifier_from_2.1>"

ATTEMPT_FILE=$(python3 -c "
import json, glob, os
for f in sorted(glob.glob('/home/oruc/Desktop/codex/.symphony/attempts/*.json'), key=lambda x: -os.path.getmtime(x)):
    if json.load(open(f)).get('issueIdentifier') == '$ISSUE_ID':
        print(f); break
")
if [ -z "$ATTEMPT_FILE" ]; then
  echo "❌ No attempt files found in .symphony/attempts/"
else
  echo "=== Attempt file: $ATTEMPT_FILE ==="
  python3 -c "
import json, sys
a = json.load(open('$ATTEMPT_FILE'))
errors = []

status = a.get('status', 'missing')
print(f'status: {status}')
if status != 'completed':
    errors.append(f'❌ Expected status=completed, got {status}')
else:
    print('✅ status=completed')

pr_url = a.get('pullRequestUrl')
if pr_url:
    print(f'✅ pullRequestUrl: {pr_url}')
else:
    errors.append('❌ pullRequestUrl missing from attempt JSON')

stop_signal = a.get('stopSignal')
if stop_signal == 'done':
    print(f'✅ stopSignal=done')
elif stop_signal:
    errors.append(f'❌ Unexpected stopSignal={stop_signal}')
else:
    errors.append('❌ stopSignal missing from attempt JSON')

for err in errors:
    print(err)
print()
print('VERDICT: ❌ FAIL' if errors else 'VERDICT: ✅ ALL CHECKS PASSED')
"
fi
```

### 5.3 Verify GitHub PR exists

Use the `pullRequestUrl` from the attempt JSON to confirm the PR is accessible on GitHub.

```bash
ATTEMPT_FILE=$(python3 -c "import json, glob, os; [print(f) for f in sorted(glob.glob('/home/oruc/Desktop/codex/.symphony/attempts/*.json'), key=lambda x: -os.path.getmtime(x)) if json.load(open(f)).get('pullRequestUrl')][:1]")
PR_URL=$(python3 -c "import json; print(json.load(open('$ATTEMPT_FILE')).get('pullRequestUrl', ''))" 2>/dev/null)

if [ -z "$PR_URL" ]; then
  echo "❌ No pullRequestUrl in attempt JSON — cannot verify PR"
else
  echo "Checking PR: $PR_URL"
  PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')
  RESULT=$(curl -s -H "Authorization: token $(gh auth token)" \
    "https://api.github.com/repos/OmerFarukOruc/symphony-orchestrator/pulls/$PR_NUMBER")
  STATE=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('state','missing'))" 2>/dev/null)
  TITLE=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('title','missing')[:80])" 2>/dev/null)
  if [ "$STATE" = "open" ]; then
    echo "✅ PR #$PR_NUMBER is open: $TITLE"
  else
    echo "❌ PR state unexpected: $STATE (title: $TITLE)"
  fi
fi
```

### 5.4 Verify workspace has the expected file

```bash
ISSUE_ID="<identifier_from_2.1>"
WS="/home/oruc/Desktop/symphony-workspaces/$ISSUE_ID"

echo "=== Workspace Check ==="
if [ -f "$WS/.editorconfig" ]; then
    echo "✅ .editorconfig exists"
    cat "$WS/.editorconfig"
else
    echo "❌ .editorconfig not found in workspace"
    ls -la "$WS/" 2>/dev/null || echo "Workspace does not exist"
fi

echo ""
echo "=== Git Log ==="
cd "$WS" && git log --oneline -3 && git status --short
```

### 5.5 Check the event log for agent output

```bash
LATEST_LOG=$(ls -t /home/oruc/Desktop/codex/.symphony/events/*.jsonl 2>/dev/null | head -1)
if [ -n "$LATEST_LOG" ]; then
  echo "=== Agent Messages ==="
  python3 -c "
import json
for line in open('$LATEST_LOG'):
    e = json.loads(line)
    if e.get('event') == 'item_completed' and e.get('content'):
        print(f'[{e[\"at\"][-12:]}] {e[\"content\"][:300]}')
        print()
"
else
  echo "❌ No event log files found"
fi
```

### 5.6 Check the dashboard UI

Open http://127.0.0.1:4000 in a browser and verify:

- The issue shows as **completed** (green)
- Agent reasoning / output is visible in the detail view
- Token usage is displayed
- The PR URL appears in the attempt details

---

## Phase 6: Restart Resilience Test

This phase verifies that Symphony does **not** re-dispatch already-completed issues after a restart. It tests the `seedCompletedClaims` fix.

### 6.1 Stop Symphony

```bash
kill $SYMPHONY_PID 2>/dev/null || fuser -k 4000/tcp 2>/dev/null
sleep 2
echo "Symphony stopped (PID $SYMPHONY_PID)"
```

### 6.2 Restart Symphony with the same settings

```bash
export LOG_FILE_2="/tmp/symphony-e2e-restart-$(date +%s).log"

cd /home/oruc/Desktop/codex && \
  node dist/cli/index.js ./WORKFLOW.md --port 4000 > "$LOG_FILE_2" 2>&1 &
SYMPHONY_PID_2=$!

echo "Restarted Symphony PID=$SYMPHONY_PID_2  LOG=$LOG_FILE_2"
sleep 5
grep -E "service started|seeded|claim" "$LOG_FILE_2" | head -5
```

**Verify seeding:** look for `"seeded completed issue claims from attempt store"` in the log. This confirms the fix is active.

### 6.3 Wait and confirm no re-dispatch

Wait 90 seconds (3× the polling interval) and verify the completed issue is NOT being re-dispatched.

```bash
ISSUE_ID="<identifier_from_2.1>"

sleep 90

echo "=== Re-dispatch Check ==="
python3 -c "
import subprocess, json

result = subprocess.run(
  ['curl', '-s', 'http://127.0.0.1:4000/api/v1/state'],
  capture_output=True, text=True
)
d = json.loads(result.stdout)
running = [r for r in d.get('running', []) if r.get('identifier') == '$ISSUE_ID']
if running:
    print(f'❌ FAIL — issue $ISSUE_ID is running again: {running}')
else:
    print(f'✅ PASS — issue $ISSUE_ID is not running after restart')
    completed = [c for c in d.get('completed', []) if c.get('identifier') == '$ISSUE_ID']
    if completed:
        print(f'✅ Issue still shows as completed: {completed[0].get(\"status\")}')
"

echo "=== Dispatch log lines for $ISSUE_ID ==="
grep "$ISSUE_ID" "$LOG_FILE_2" | head -10
```

**PASS criteria:** no lines with `$ISSUE_ID` in a `dispatch` or `worker_started` context, and the API still shows it as `completed`.

---

## Phase 7: Cleanup

### 7.1 Stop Symphony

```bash
kill $SYMPHONY_PID_2 2>/dev/null || fuser -k 4000/tcp 2>/dev/null
echo "Symphony stopped"
```

### 7.2 Move issue to Done in Linear

```bash
ISSUE_UUID="<issue_id_from_2.1>"
DONE_STATE_ID="941e87a9-6bd6-40bd-9ca3-e97fc680b719"

curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { issueUpdate(id: \\\"$ISSUE_UUID\\\", input: { stateId: \\\"$DONE_STATE_ID\\\" }) { success } }\"}" | python3 -m json.tool
```

### 7.3 Clean up workspace

```bash
ISSUE_ID="<identifier_from_2.1>"
rm -rf "/home/oruc/Desktop/symphony-workspaces/$ISSUE_ID"
echo "Workspace removed"
```

---

## Summary Report

After completing all phases, produce a summary:

```
## E2E Test Report — <timestamp>

| Check                              | Result  |
|------------------------------------|---------|
| Build & tests                      | ✅ / ❌  |
| Linear issue created               | NIN-XX  |
| Agent picked up issue              | ✅ / ❌  |
| SYMPHONY_STATUS: DONE detected     | ✅ / ❌  |
| API status = completed             | ✅ / ❌  |
| pullRequestUrl in attempt JSON     | ✅ / ❌  |
| stopSignal=done in attempt JSON    | ✅ / ❌  |
| GitHub PR open and accessible      | ✅ / ❌  |
| File present in workspace          | ✅ / ❌  |
| Agent output in event log          | ✅ / ❌  |
| Dashboard shows completed          | ✅ / ❌  |
| Restart: seeded claims logged      | ✅ / ❌  |
| Restart: no re-dispatch (90s)      | ✅ / ❌  |
| Cleanup done                       | ✅ / ❌  |

**Overall:** PASS / FAIL
```
