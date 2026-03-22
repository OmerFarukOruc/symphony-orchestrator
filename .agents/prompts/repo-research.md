# Context

I maintain **Symphony Orchestrator** — an autonomous AI agent orchestration platform
that dispatches coding agents (Codex CLI workers) against Linear issues, manages
retries/timeouts, persists attempt history, and serves a real-time dashboard.

Key architecture points for context:
- **Stack**: Strict ESM TypeScript, Node.js 22+, Vitest tests
- **Core modules**: `src/orchestrator.ts` (polling/retries), `src/agent-runner.ts`
  (Codex worker exec), `src/http-server.ts` (dashboard), `src/linear-client.ts`
  (Linear transport), `src/attempt-store.ts` (persistence),
  `src/workspace-manager.ts` (workspace lifecycle)
- **CLI entry**: `src/cli.ts` — process startup, archive dir setup
- **Integration**: Linear (issue tracking), GitHub (PRs), OpenAI Codex (agent runtime)
- **Design principles**: Small focused modules (<200 LOC), extracted helpers over
  inheritance, context interfaces for dependency passing

Our feature roadmap is tracked in a single GitHub Epic issue:
- **[EPIC] Symphony v2 Feature Roadmap**: https://github.com/OmerFarukOruc/symphony-orchestrator/issues/9
- **Local roadmap doc**: `/home/oruc/Desktop/codex/docs/ROADMAP_AND_STATUS.md`

# Task

Research the repository below using the `gh` CLI and web tools. Extract ideas,
patterns, and features that Symphony can adopt or adapt. Cross-reference every
finding against Epic issue #9 to avoid duplicates.

# Instructions

## 1. Deep Research via `gh` CLI

Use the GitHub CLI (`gh`) to systematically extract ALL available information
from the target repo. Run these commands (adapt owner/repo as needed):

```bash
# ── Repo overview ──
gh repo view {owner}/{repo}
gh repo view {owner}/{repo} --json description,homepageUrl,languages,topics,licenseInfo

# ── README & docs ──
gh api repos/{owner}/{repo}/readme --jq '.content' | base64 -d
# Browse docs directory if it exists:
gh api repos/{owner}/{repo}/contents/docs --jq '.[].name'
# Then fetch each doc:
gh api repos/{owner}/{repo}/contents/docs/{filename} --jq '.content' | base64 -d

# ── Source tree structure ──
gh api repos/{owner}/{repo}/git/trees/main?recursive=1 \
  --jq '.tree[] | select(.type=="blob") | .path' | head -200

# ── Key source files (read important ones) ──
gh api repos/{owner}/{repo}/contents/src/{filename} --jq '.content' | base64 -d
# Read package.json, tsconfig.json, Dockerfile, docker-compose.yml, etc.
gh api repos/{owner}/{repo}/contents/package.json --jq '.content' | base64 -d

# ── Issues & discussions ──
gh issue list --repo {owner}/{repo} --limit 50 --state all \
  --json number,title,labels,state
gh issue list --repo {owner}/{repo} --label "enhancement" --limit 30 \
  --json number,title,body

# ── Pull requests (recent patterns & features) ──
gh pr list --repo {owner}/{repo} --limit 30 --state all \
  --json number,title,labels,state
# Read notable PRs for implementation details:
gh pr view {number} --repo {owner}/{repo} --json title,body,files

# ── Releases & changelog ──
gh release list --repo {owner}/{repo} --limit 10
gh release view latest --repo {owner}/{repo} --json tagName,body

# ── Actions / CI configuration ──
gh api repos/{owner}/{repo}/contents/.github/workflows --jq '.[].name'
# Then read each workflow file

# ── Contributors & activity ──
gh api repos/{owner}/{repo}/stats/contributors --jq '.[].author.login'
gh api repos/{owner}/{repo}/commits?per_page=20 --jq '.[].commit.message'
```

**Go beyond the README.** Read actual source files to understand:
- Architecture patterns (module structure, dependency injection, error handling)
- CLI ergonomics (argument parsing, help text, interactive prompts, progress output)
- DevOps practices (CI/CD, Docker, release automation, health checks)
- Testing patterns (mocking strategies, fixture management, integration test isolation)
- Observability (logging, metrics, tracing, structured output)
- Agent/LLM integration patterns (prompt management, model switching, context handling)
- Retry/resilience patterns (backoff strategies, circuit breakers, timeout handling)
- Dashboard/UI patterns (real-time updates, WebSocket usage, templating)

## 2. Cross-Reference with Epic #9

```bash
# Fetch the current Epic body
gh issue view 9 --repo OmerFarukOruc/symphony-orchestrator --json body --jq '.body'
```

For each finding, determine:
- **Already covered?** → Enhance the existing item with implementation details,
  references, or architectural hints inspired by the researched repo. Be DETAILED —
  include specific file paths, function names, or patterns worth emulating.
- **Not covered?** → It becomes a candidate for a new item.

## 3. Create GitHub Issues for New Items

For every NEW item that will be added to the Epic, **create a real GitHub issue first**:

```bash
gh issue create \
  --repo OmerFarukOruc/symphony-orchestrator \
  --title "[T{tier}] {Feature name}" \
  --body "## Description
{Brief description of the feature and why it matters for Symphony.}

## Inspiration
(inspired by [{repo-name}]({repo-url}))

## Key References
- {Link to specific file/pattern in the source repo}

## Implementation Notes
- {How this would fit into Symphony's architecture}
- {Which existing modules would be affected}
- {Estimated complexity: low/medium/high}"
```

- Collect the returned `#number` for each created issue.
- **Every item in the Epic and roadmap MUST have a GitHub issue number.**
  Never add unnumbered items.

## 4. Update the Epic Issue Body (NOT comments)

Edit the issue body directly:

```bash
# Read current body, modify, then update:
gh issue view 9 --repo OmerFarukOruc/symphony-orchestrator \
  --json body --jq '.body' > /tmp/epic_body.md
# ... edit /tmp/epic_body.md ...
gh issue edit 9 --repo OmerFarukOruc/symphony-orchestrator \
  --body-file /tmp/epic_body.md
```

Rules:
- Do NOT create new comments beneath the issue.
- Do NOT remove or weaken existing items — only enrich or add.
- Preserve existing structure, formatting, and tier organization.
- New items must reference their GitHub issue number (e.g., `#75`).
- Use format: `(inspired by [{repo-name}]({repo-url}))` for attributions.
- **Do NOT add skipped/rejected items to the Epic body.**

## 5. Update ROADMAP_AND_STATUS.md

Sync `/home/oruc/Desktop/codex/docs/ROADMAP_AND_STATUS.md` to reflect
any new items or enriched descriptions added to the Epic.

Rules:
- Maintain existing document structure and tier organization.
- Keep status markers accurate (`[ ]` for planned, `[x]` for done).
- Every row must include the GitHub issue link (e.g., `[#75](...)`).
- Update Summary table counts to reflect new items.
- **Do NOT add skipped/rejected items to the roadmap.**

## 6. Produce a Research Summary

Create a research artifact summarizing:

- **Repo Overview**: What it does, tech stack, notable design decisions
- **Key Findings** (bulleted, grouped by theme):
  - Architecture & patterns
  - CLI & UX
  - DevOps & CI/CD
  - Testing & quality
  - Agent/LLM-specific patterns
  - Observability & monitoring
- **Items Added to Epic** (with issue numbers, links, and tier)
- **Items Enriched in Epic** (what was added and why)
- **Items Deliberately Skipped** (with reasoning)
- **"Consider" Items** (uncertain fit — flagged for future discussion)

# Constraints

- **Every new item MUST have a GitHub issue.** No unnumbered items in Epic or roadmap.
- **Skipped items go ONLY in the research summary artifact.**
- Do not alter shipped/completed items in the Epic.
- Be thorough in research but concise in writing — no fluff.
- If unsure whether something fits Symphony's scope, flag it as "Consider"
  in the summary rather than silently adding it.
- **Respect Symphony's architecture**: small modules (<200 LOC), strict ESM,
  extracted helpers, context interfaces. Recommendations must be compatible.
- When suggesting implementation, reference specific Symphony modules that
  would be affected (e.g., "extend `src/orchestrator.ts`" or "new module
  `src/metrics/collector.ts`").

---

## Repository to Research

Repo: [PASTE_URL_HERE]
