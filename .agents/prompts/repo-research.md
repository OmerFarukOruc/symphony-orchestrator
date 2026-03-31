# Repo Research — Agent Work Order Protocol

Research open-source repositories and produce batch-ready agent work orders
for Risoluto's feature roadmap (Epic #9).

---

## 1. Context Import

Before starting research, execute the Self-Discovery protocol in `risoluto-context.md`.
Capture the output — you will use it as ground truth for all module paths, patterns,
and issue references throughout this session.

If the discovery output is unavailable, abort and report the failure. Never guess
module paths — stale references break agent work orders downstream.

---

## 2. Research Protocol

Use the GitHub CLI (`gh`) to systematically extract ALL available information
from the target repo. Run these commands (adapt `{owner}/{repo}` as needed):

### 2.1 Repo Overview

```bash
# ── Repo metadata ──
gh repo view {owner}/{repo}
gh repo view {owner}/{repo} --json description,homepageUrl,languages,topics,licenseInfo

# ── README & docs ──
gh api repos/{owner}/{repo}/readme --jq '.content' | base64 -d
gh api repos/{owner}/{repo}/contents/docs --jq '.[].name'
# Fetch each discovered doc:
gh api repos/{owner}/{repo}/contents/docs/{filename} --jq '.content' | base64 -d

# ── Source tree structure ──
gh api repos/{owner}/{repo}/git/trees/main?recursive=1 \
  --jq '.tree[] | select(.type=="blob") | .path' | head -200
```

### 2.2 Source Reading

**Go beyond the README.** Read actual implementation files:

```bash
# ── Key source files ──
gh api repos/{owner}/{repo}/contents/src/{filename} --jq '.content' | base64 -d
# Read package.json, tsconfig.json, Dockerfile, docker-compose.yml, etc.
gh api repos/{owner}/{repo}/contents/package.json --jq '.content' | base64 -d
```

Extract architecture insights from each file:

- Module structure and dependency injection patterns
- CLI ergonomics (argument parsing, help text, interactive prompts, progress output)
- DevOps practices (CI/CD, Docker, release automation, health checks)
- Testing patterns (mocking strategies, fixture management, integration test isolation)
- Agent/LLM integration patterns (prompt management, model switching, context handling)
- Retry/resilience patterns (backoff strategies, circuit breakers, timeout handling)
- Dashboard/UI patterns (real-time updates, WebSocket/SSE usage, templating)
- Observability (logging, metrics, tracing, structured output)

### 2.3 Issues, PRs, Releases, CI

```bash
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

### 2.4 Pattern Extraction

Explicitly look for these six Risoluto patterns in the target repo. If found,
document the implementation approach and note how it maps to Risoluto's design:

| # | Pattern | Risoluto Module |
|---|---------|----------------|
| 1 | Port interfaces (dependency inversion) | `src/core/attempt-store-port.ts`, `src/orchestrator/port.ts`, `src/git/port.ts`, `src/tracker/port.ts` |
| 2 | Config schemas & validation | `src/config/schemas/*.ts`, `src/config/validators.ts` |
| 3 | HTTP routes & OpenAPI | `src/http/routes.ts`, `src/http/openapi.ts` |
| 4 | EventBus / lifecycle events | `src/core/event-bus.ts`, `src/core/lifecycle-events.ts` |
| 5 | Module wiring & service init | `src/cli/services.ts`, `src/cli/runtime-providers.ts` |
| 6 | Test structure & fixtures | `tests/*.test.ts`, `tests/fixtures/` |

---

## 3. Cross-Reference Protocol

Before creating any issues, cross-reference against LIVE state:

1. Fetch current epic body:
   ```bash
   gh issue view 9 --repo OmerFarukOruc/risoluto --json body --jq '.body'
   ```

2. Fetch ALL open issues (not just 50):
   ```bash
   gh issue list --repo OmerFarukOruc/risoluto --limit 200 --state open --json number,title,labels
   ```

3. For each finding, determine:
   - **Already covered?** --> Enrich the existing issue (append reference section, don't overwrite)
   - **Partially covered?** --> Flag for enhancement with specific gaps
   - **Not covered?** --> Candidate for new issue (must pass quality gates below)
   - **Duplicate of another finding?** --> Merge into single issue

4. Check recent git history for already-shipped features:
   ```bash
   git log --oneline -50
   ```

---

## 4. Issue Creation -- Agent Work Orders

For every NEW item that will be added to the Epic, **create a real GitHub issue first**
using the canonical template below. Every item in the Epic and roadmap MUST have a
GitHub issue number. Never add unnumbered items.

### Canonical Template

```markdown
**Epic:** #9
**Tier:** T{1-4}
**Bundle:** {N -- Name}
**Complexity:** {low | medium | high}

## What
{2-4 sentences: what this feature is and why Risoluto needs it.
Frame the value -- what problem does it solve for operators?}

## Prior Art
{Which open-source projects implement this, and how.}

### {Project Name 1} ([repo-link])
{How they implement it -- architecture pattern, key abstractions, flow.}
{Code snippets from the source repo where they illuminate the pattern.}
**Key files:**
- `path/to/file.ts` -- {what it does}

### {Project Name 2} ([repo-link])
{Same structure if multiple sources.}

## Risoluto Adaptation
{How this maps to Risoluto's current architecture.}
{Which existing modules are affected, what new modules are needed.}
{Config surface (new WORKFLOW.md / env vars / CLI flags) if applicable.}
{API surface (new endpoints, SSE events, CLI commands) if applicable.}

### Affected Modules
- `src/path/module.ts` -- {what changes and why}
- `src/path/new-module.ts` -- (new) {purpose}

### Design Sketch
{Code interfaces, types, config schema -- the concrete shape of the feature.}
{Keep these as directional sketches, not final implementations.}

## Dependencies
- **Requires:** #{issue} -- {why this must ship first}
- **Unlocks:** #{issue} -- {what this enables}

## Acceptance Criteria
- [ ] {Testable, specific criterion}
- [ ] {Unit/integration test requirement}
- [ ] {Docs/operator guide update if user-facing}

## Open Questions
- {Unresolved design decisions flagged during research}
- {Trade-offs to evaluate during implementation}
```

### Template Principles

1. **Self-contained** -- reader can start implementing without re-doing research
2. **Prior art is first-class** -- every inspiration repo gets its own subsection
3. **Drift-aware** -- all `src/` paths verified against discovery output
4. **Forward-linking** -- dependencies and unlocks create a navigable graph
5. **Preserve everything** -- all existing research content restructured, never deleted
6. **Open questions surface uncertainty** -- unresolved decisions are explicit, not hidden

### Issue Creation Command

```bash
gh issue create \
  --repo OmerFarukOruc/risoluto \
  --title "[T{tier}] {Feature name}" \
  --body-file /tmp/issue_body.md
```

Collect the returned `#number` for each created issue.

---

## 5. Bundle Assignment

Classify each new issue into one of these bundles (or propose a new bundle if none fits):

| # | Bundle Name | Scope |
|---|-------------|-------|
| 1 | Config & Validation | Config store, schemas, CLI init, validation |
| 2 | Observability & Logging | Events, alerts, metrics, health monitoring |
| 3 | Agent Runtime & Execution | Runner, retries, tool control, dry-run |
| 4 | Multi-Agent & Orchestration | Pipelines, dependency ordering, concurrency |
| 5 | Security & Auth | Secrets, OAuth, trust boundaries, sandboxing |
| 6 | Dashboard & UI | Real-time display, settings, logs viewer |
| 7 | Workflow & Templates | WORKFLOW.md features, prompt templates, variables |
| 8 | Git & SCM Integration | Branching, PR automation, merge strategies |
| 9 | Tracker Integration | Linear/GitHub sync, custom adapters, webhooks |
| 10 | Notification & Reporting | Slack/email alerts, daily digests, cost reports |
| 11 | Developer Experience | CLI ergonomics, docs, debugging tools |
| 12 | Infrastructure & Deployment | Docker, packaging, CI/CD, scaling |

For each issue, score parallelizability:
- **Independent**: No file overlap with other issues in the same bundle --> can run in parallel via `/batch`
- **Sequenced**: Depends on another issue landing first --> must be ordered
- **Overlapping**: Touches same files as a sibling issue --> needs merge coordination

Flag cross-bundle dependencies explicitly.

---

## 6. Quality Gates

Every issue MUST pass these gates before creation:

1. **Implementable in one agent session**: If the issue would take more than ~2 hours of focused agent work, split it
2. **Testable acceptance criteria**: Every AC item must be verifiable (run a command, check output, inspect file)
3. **Valid module paths**: All `src/` paths must match the discovery output from `risoluto-context.md` -- never use stale paths
4. **File boundary clarity**: List every file the issue will create or modify. Flag overlap with other issues.
5. **Size estimate**: low (<100 LOC) / medium (100-300 LOC) / high (300+ LOC, consider splitting)
6. **No orphan items**: Every issue must link to Epic #9. Every item in the Epic must have a GitHub issue number.

---

## 7. Enriching Existing Issues

For every **existing** issue that gained new implementation details from the
researched repo, **append** a reference section to that issue's body:

```bash
# Read current body
body=$(gh issue view {number} --repo OmerFarukOruc/risoluto --json body --jq '.body')

# Check for existing reference section from this repo (skip if present)
echo "$body" | grep -q "{repo-name} Reference" && echo "SKIP: already enriched" && exit 0

# Append a reference section (do NOT overwrite existing content)
new_body="${body}

---

## {repo-name} Reference Implementation
*(added from [{repo-name}]({repo-url}) research -- $(date +%Y-%m-%d))*

### Architecture Notes
{How the researched repo implements this feature.}

### Code Patterns
{Key functions, classes, or design patterns worth emulating.
Include short code snippets where they clarify the pattern.}

### File References
- [{filename}]({link}) -- {what it does}

### Risoluto Adaptation Notes
{How this maps to Risoluto's modules. Reference specific files from discovery output.}"

echo "$new_body" | gh issue edit {number} --repo OmerFarukOruc/risoluto --body-file -
```

Rules:
- **Append only** -- never remove or rewrite the existing issue body.
- **Check for duplicates** -- skip if the issue already contains a reference
  section for this repo (grep for `{repo-name} Reference`).
- Each enrichment section MUST include:
  - **Architecture notes**: How the researched repo implements this feature
  - **Code patterns**: Key functions, classes, or design patterns worth emulating
  - **File references**: Links to specific source files in the researched repo
  - **Risoluto adaptation notes**: How this maps to Risoluto's modules
- Be detailed and actionable -- someone reading the issue should be able to
  start implementing without re-doing the research.
- Do this for ALL enriched issues, not just the Epic body.

---

## 8. Update Epic Body

Edit the Epic issue body directly:

```bash
# Read current body, modify, then update:
gh issue view 9 --repo OmerFarukOruc/risoluto \
  --json body --jq '.body' > /tmp/epic_body.md
# ... edit /tmp/epic_body.md ...
gh issue edit 9 --repo OmerFarukOruc/risoluto \
  --body-file /tmp/epic_body.md
```

Rules:
- Do NOT create new comments beneath the issue.
- Do NOT remove or weaken existing items -- only enrich or add.
- Preserve existing structure, formatting, and tier organization.
- New items must reference their GitHub issue number (e.g., `#75`).
- Use format: `(inspired by [{repo-name}]({repo-url}))` for attributions.
- **Do NOT add skipped/rejected items to the Epic body.**

---

## 9. Research Summary

Produce a research artifact summarizing:

- **Repo Overview**: What it does, tech stack, notable design decisions
- **Key Findings** (bulleted, grouped by theme):
  - Architecture & patterns
  - CLI & UX
  - DevOps & CI/CD
  - Testing & quality
  - Agent/LLM-specific patterns
  - Observability & monitoring
- **Items Added to Epic** (with issue numbers, links, tier, and bundle assignment)
- **Items Enriched in Epic** (what was added and why)
- **Items Deliberately Skipped** (with reasoning)
- **"Consider" Items** (uncertain fit -- flagged for future discussion)
- **Bundle Summary**: Count of issues per bundle, parallelizability breakdown
- **Quality Gate Compliance**: Confirm every created issue passed all 6 gates

---

## 10. Source Repositories

Research targets (run against each repo, or a subset as directed):

| # | Repo | GitHub URL | Focus Area |
|---|------|-----------|------------|
| 1 | thepopebot | stephengpope/thepopebot | Agent orchestration, CLI patterns |
| 2 | hatice | mksglu/hatice | Agent management, Turkish NLP integration |
| 3 | pilot | crisner1978/pilot | Agent workflows, task automation |
| 4 | pilot (fork) | alekspetrov/pilot | Fork divergence, additional features |
| 5 | Eva | vedantb2/eva | Multi-agent coordination |
| 6 | Orchestra | Traves-Theberge/Orchestra | Orchestration patterns, UI |
| 7 | vibe-kanban | BloopAI/vibe-kanban | Kanban + AI agent integration |
| 8 | jinyang | romancircus/jinyang-public | Agent runtime patterns |
| 9 | symphony-for-github-projects | t0yohei/symphony-for-github-projects | GitHub Projects integration |
| 10 | mog | bobbyg603/mog | Monitoring, observability |
| 11 | pi-skills | badlogic/pi-skills | Skill system, plugin architecture |
| 12 | Eruda | liriliri/eruda | DevTools library (reference, not orchestrator) |
| 13 | Composio | -- | Composable tool/action framework (no URL found) |

---

## 11. Constraints

- **Every new item MUST have a GitHub issue.** No unnumbered items in Epic or roadmap.
- **Every issue must follow the canonical template** (Section 4).
- **Bundle assignment is mandatory** (Section 5).
- **Quality gates must pass** (Section 6).
- **Discovery output is the source of truth** for all module paths. Never guess paths.
- **Skipped items go ONLY in the research summary artifact.**
- Do not alter shipped/completed items in the Epic.
- Be thorough in research but concise in writing -- no fluff.
- If unsure whether something fits Risoluto's scope, flag it as "Consider"
  in the summary rather than silently adding it.
- **Respect Risoluto's architecture**: strict ESM TypeScript, `.js` import extensions,
  small focused modules (<200 LOC), port interfaces for dependency inversion,
  extracted helpers over inheritance, context interfaces for dependency passing.
- When suggesting implementation, reference specific Risoluto modules from the
  discovery output (e.g., `src/orchestrator/orchestrator.ts`, not the stale
  `src/orchestrator.ts`).

---

## Repository to Research

Repo: [PASTE_URL_HERE]
