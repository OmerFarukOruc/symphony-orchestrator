# Extraction methods — how to actually hit every surface

The whole skill depends on this file. If you skip surfaces, the `[NEW]` list will be artificially short and `[R!]` decisions will be wrong. Treat this as a checklist, not a suggestion.

## Contents

- [The surface matrix](#the-surface-matrix)
- [For a GitHub repository](#for-a-github-repository)
- [For a product website](#for-a-product-website)
- [For a hybrid target (website + linked repo)](#for-a-hybrid-target-website--linked-repo)
- [Subagent delegation pattern](#subagent-delegation-pattern)
- [When to stop](#when-to-stop)
- [Hard cases](#hard-cases)

## The surface matrix

Features reveal themselves at different surfaces. Each surface has a different signal shape. Hit all of them or accept a lower coverage score.

| Surface | Signal | Coverage gain when hit | Cost |
|---------|--------|------------------------|------|
| README | Marketing claims + top-level capabilities | High (breadth) | Low |
| docs/ tree | Behavior details + rules/limits | Very high | Medium |
| CHANGELOG / release notes | Every shipped feature with date | Very high | Low–medium |
| CLI `--help` / subcommands | Every user-facing command and flag | High | Low once binary runs |
| HTTP/GraphQL route tables | Every API the product exposes | High | Medium |
| OpenAPI / GraphQL schema files | Complete API contract | Very high | Low if present |
| Config schema (env, YAML, flags) | Every operator-tunable behavior | High | Medium |
| Test `describe`/`it` blocks | Features enumerated in natural language | High | Low |
| Public package exports | Library-level features | Medium | Medium |
| Top production deps | Capability signals (e.g., `stripe`→billing) | Medium | Low |
| Issue labels + open issue titles (≤100) | Roadmap + known gaps | Medium | Low |
| Example / demo directories | Real usage patterns | Medium | Medium |
| CI workflow files | Quality gates + delivery mechanisms | Low–medium | Low |
| Security / trust docs | Sandbox + auth behavior | Medium | Low |
| Pricing page (websites only) | Commercial features / tiers | High for websites | Low |

## For a GitHub repository

Run these in the listed order. Don't skip ahead — signals from earlier steps inform how aggressively to dig in later steps.

### Step 1 — Clone and pin version

**Default path: full shallow clone.** Higher fidelity than API fetches, and grep/colgrep over a local tree is much cheaper than round-tripping to GitHub.

```bash
mkdir -p /tmp/risoluto-research

# Detect the default branch first — NOT every repo uses `main`.
# Known exception: AgentFlow and older forks use `master`.
DEFAULT_BRANCH=$(gh repo view <owner>/<repo> --json defaultBranchRef --jq '.defaultBranchRef.name')

git clone --depth 1 --branch "$DEFAULT_BRANCH" <repo-url> /tmp/risoluto-research/<slug>
cd /tmp/risoluto-research/<slug>
git rev-parse --short HEAD           # record as commit evidence
git describe --tags --always         # record as version evidence
```

If the user passed a pinned version / tag, fetch that explicitly:

```bash
git clone --depth 1 --branch <tag-or-sha> <repo-url> /tmp/risoluto-research/<slug>
```

**Alternate path: `gh api` (no clone).** Use when the repo is enormous (>10k files), when disk is constrained, or when the user explicitly asks for a lightweight pass. Trade-off: slower per-file reads, GitHub rate-limited, can't run the CLI locally.

```bash
# Repo metadata
gh repo view <owner>/<repo> --json description,homepageUrl,languages,topics,licenseInfo,pushedAt,stargazerCount,isArchived

# README via API
gh api repos/<owner>/<repo>/readme --jq '.content' | base64 --decode

# Source tree (capped — don't try to load full tree for huge monorepos)
gh api "repos/<owner>/<repo>/git/trees/${DEFAULT_BRANCH}?recursive=1" \
  --jq '.tree[] | select(.type=="blob") | .path' | head -300

# Read a specific file
gh api "repos/<owner>/<repo>/contents/<path>" --jq '.content' | base64 --decode
```

**Defensive rules for both paths:**

- If `base64 --decode` produces binary (zero bytes or non-UTF-8), skip the file. It's not source code.
- On `gh api` HTTP 404/403: log, skip endpoint, continue. Do not retry more than once.
- On HTTP 429 (rate limit): wait 60 seconds, retry once. If still blocked, note the gap in the coverage manifest and proceed with what you have.

### Step 1.5 — Early-exit heuristics (dead repos)

Before committing to a full extraction, check repo health. Dead or skeletal repos are expensive to analyze and rarely yield useful roadmap signal. Exit early and record the reason.

```bash
# Key signals
gh repo view <owner>/<repo> --json isArchived,pushedAt,stargazerCount,defaultBranchRef
git -C /tmp/risoluto-research/<slug> log --oneline | wc -l
find /tmp/risoluto-research/<slug> -type f -name '*.ts' -o -name '*.py' -o -name '*.go' -o -name '*.rs' -o -name '*.js' -o -name '*.ex' | wc -l
```

Skip (record reason in coverage manifest + target file summary) if:

- `isArchived: true` — target is frozen upstream.
- Last push >18 months ago AND fewer than ~5 commits in the last year — effectively dormant.
- <5 commits total — too early to have a real feature surface.
- <10 source files (excluding lockfiles, generated, vendor dirs) — not a meaningful codebase.

Dormant-but-once-interesting repos are still worth a _shallow_ pass — adopting ideas from them is fine, since there's no direction to copy. But allocate ~20% of the coverage budget, not the full extraction.

### Step 1.6 — Repo health snapshot

Record these in the target file's `## Summary` so the reader knows how to weight findings:

- **Last push:** YYYY-MM-DD (from `pushedAt`)
- **Stars:** N
- **Commits in last 90 days:** N (from `git log --since=90.days.ago --oneline | wc -l`)
- **Primary language(s):** top 2 from `languages`
- **Health:** active / dormant / archived — 1 sentence justification.

A target with 50 stars, 3 commits in 2 years, and no CI gets weighted very differently than one with 5k stars shipping weekly. The alignment is still real; the roadmap-worthiness of `[T+]` items is not.

### Step 2 — Read top-level signals in a single pass

- `README.md` — every heading is a candidate feature.
- `CHANGELOG.md` / `HISTORY.md` / `docs/RELEASES.md` — every entry is a confirmed shipped feature with a date.
- `docs/` — walk the whole tree. Record every page and its headings.
- `ROADMAP.md` / `docs/roadmap*` — explicit upcoming features; these are `[?]` until verified shipped.
- `SECURITY.md`, `TRUST.md` — sandbox + auth details.
- `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` — top 20 production deps are capability signals.

### Step 3 — Extract the entry points

- `bin/`, `cmd/`, `cli/`, `scripts/` — every binary is a surface. For each, attempt to capture `--help` output, either by reading source or (if installable without risk) by running `<binary> --help`.
- `main.py` / `index.ts` / `cmd/*/main.go` — single-binary entry points.

### Step 4 — Map the service surface

- Find the HTTP router file(s): look for `app.get`, `router.post`, `@app.route`, `handler: func`, or framework-specific route declarations. List every route with verb + path + short description.
- If an OpenAPI file exists (`openapi.yaml`, `swagger.json`): parse and list every operation.
- If GraphQL schema files exist: list every Query, Mutation, Subscription.
- If a JSON-RPC surface exists: list every method name.

### Step 5 — Map the config surface

- Find config schema files: `config.schema.json`, `defaults.yaml`, `*.env.example`, `settings.py` with Pydantic, etc.
- List every env var referenced in code via `process.env.*`, `os.getenv`, `std::env::var`.
- List every command-line flag from the CLI entry.
- Every config key is a feature — the feature that key enables.

### Step 6 — Mine the tests

- `tests/`, `__tests__/`, `*_test.go`, `spec/` — grep for `describe(`, `it(`, `test(`, `func Test`.
- Test names are usually phrased as "it <does a thing>" — gold for behavior-level features.

### Step 7 — Skim the issue tracker (optional but high-signal)

- `gh issue list --repo <org>/<repo> --state all --label "enhancement" --limit 100` — recent feature work.
- `gh issue list --repo <org>/<repo> --state closed --limit 50 --search "type:issue merged:>2025-01-01"` — recently shipped.
- `gh label list --repo <org>/<repo>` — labels are often a de-facto feature taxonomy.

### Step 8 — Review CI and release machinery

- `.github/workflows/` — CI gates reveal what the project cares about enforcing. These are often features themselves (security scans, type-coverage, perf budgets).
- Release workflow — reveals artifact types shipped (Docker image, npm package, etc.).

### Step 9 — Examples / demos

- `examples/`, `demo/`, `sample/` — real usage patterns. These sometimes surface features not mentioned in docs (e.g., an experimental plugin used in an example).

## For a product website

Start from the given URL and crawl depth-limited. Target ~15 pages, prioritizing in this order:

1. Landing page.
2. `/features` or `/product`.
3. `/docs`, `/docs/*` (at least the table of contents and the sections whose names map to Risoluto spine sections).
4. `/changelog`, `/releases`, `/updates`.
5. `/pricing` — tier-specific features are real features, not just commercial noise.
6. `/security`, `/trust`, `/compliance`.
7. `/blog` — only recent posts (last 6 months). Product launches often appear in blog posts before docs.
8. `/compare` / `/vs-<competitor>` — explicit feature comparisons, highest signal per page.
9. `/roadmap` / `/planned` — candidate `[?]` items.
10. `/api` / API docs subdomain.

Use `defuddle` (primary) for clean markdown extraction. Fall back to `WebFetch` if defuddle fails. For interactive / heavily-scripted pages where content is rendered client-side, use `agent-browser`.

If the site links to a GitHub repo in its footer or docs, run the repo extraction too — don't skip it just because the website has docs. Code reveals things marketing copy won't.

Record for every page fetched: URL, fetch timestamp, HTTP status, and — if available — `Last-Modified` header or Archive.org snapshot URL.

## For a hybrid target (website + linked repo)

Run both. Merge features. If a feature appears in both sources, the evidence block should cite both, and confidence rises to `high`. If a feature appears only in marketing copy (website) but not in the repo, note "marketing claim not verified in source" in the comparison field and drop confidence to `medium` or `low`.

## Subagent delegation pattern

Two chunking strategies, used for two different passes. Pass 1 (spine-driven alignment) chunks by **spine section**. Pass 2 (target-novel enumeration) chunks by **target surface**. They're complementary — run both, merge results.

### Pass 1 chunking — by spine section

Spawn one subagent per spine section. Each subagent gets:

- One brief from `research/.briefs/NN-<section>.md` (or, if briefs are absent, the matching `##` section of `RISOLUTO_FEATURES.md`).
- A pointer to the already-extracted target corpus (clone path for repos, page cache for websites).
- Instructions to return one alignment record per spine item in that section, with legend code + evidence + `Searched for:` queries for any `[R!]`.

This parallelizes cleanly: ~11 spine sections × ≤15 items each × one subagent per section fits in a single fan-out. The main agent merges — no dedup needed because each subagent owns a disjoint slice of the spine.

Prefer this over "one subagent walks the entire spine serially." With a 120+-item spine, serial walks blow the context budget and lose fidelity on later items.

### Pass 2 chunking — by target surface

When the target is non-trivial (>50 source files or >10 doc pages), spawn specialized `Explore` subagents in parallel — one per surface type. This catches things a single serial pass would miss because each subagent focuses narrowly on its surface.

Recommended parallel surfaces:

- `routes-and-api` — one subagent hunts every route/endpoint/RPC method.
- `cli-and-config` — one subagent hunts every CLI entry + every config key.
- `docs-and-readme` — one subagent walks the docs tree + README.
- `tests-and-examples` — one subagent mines tests and examples.
- `changelog-and-issues` — one subagent reads CHANGELOG + recent issues.

Each subagent returns a structured list with evidence. The main agent merges, dedups against Pass 1 results (so a feature already coded in Pass 1 isn't re-surfaced as `[NEW]`), and files remaining items as `[NEW]`. Tell every subagent explicitly to **use `colgrep` as its primary search tool** (not Grep or Glob), and to return structured briefs, not raw dumps.

### Subagent prompt template

Paste this verbatim into every surface-subagent or spine-section-subagent prompt. The colgrep reminder block is the important part — without it, subagents default to Grep/Glob and miss semantic matches.

```
You are investigating surface <surface-name> for target <target-slug>.

Input: local clone at /tmp/risoluto-research/<slug>/ OR website root at <url>.

Your job: enumerate every feature that this surface reveals. For each feature, return:
- title (short, scannable)
- 2–5 observable behaviors (rules, limits, defaults, UX specifics)
- evidence (file path + line range, or URL + section anchor)
- direct quote (1–3 lines from source)
- confidence (high/medium/low)

This project has `colgrep` installed — a semantic code search tool.
Use `colgrep` (via Bash) as your PRIMARY search tool instead of Grep/Glob.

COLGREP COMMANDS:
- Semantic search:      colgrep "error handling" -k 10
- Regex + semantic:     colgrep -e "fn.*test" "unit tests"
- Pattern only:         colgrep -e "async fn"
- Search in path:       colgrep "query" ./src/api
- Filter by type:       colgrep --include="*.rs" "query"
- Multiple types:       colgrep --include="*.{ts,tsx}" "query"
- List files only:      colgrep -l "query"
- Exclude tests:        colgrep --exclude="*_test.go" "query"
- Whole word:           colgrep -e "test" -w "testing"

COLGREP BEHAVIOR:
- First query may take 30-90 seconds (model loading + index building); subsequent queries are <5 seconds.
- NEVER run colgrep in background mode — wait for the result.
- NEVER fall back to Grep/Glob while colgrep is running.
- If colgrep returns no results, try broader semantic terms or regex-only mode.

DO NOT use Grep or Glob tools — use colgrep via Bash instead.

Do not recommend or implement changes — this is read-only research.
Return a structured Markdown report. Under 300 lines.
```

## When to stop

Stop a surface-hunt when one of these is true:

- You've hit every item on that surface's checklist.
- You've hit diminishing returns — three consecutive pages/files reveal no new features.
- The surface is not present in this target (e.g., no CLI because it's a pure library — record "no CLI surface" in the coverage manifest and move on).

Do NOT stop because the total feature count feels "enough." The goal is to enumerate, not to shortlist. Shortlisting happens in the roadmap section.

## Hard cases

### Monorepo with many sub-packages

Run the extraction per sub-package that is user-facing. Don't treat the monorepo root as the target. In the coverage manifest, list each sub-package as a separate row.

### Paywalled or login-required docs

Fetch what's public. Mark the paywalled pages `[?]` with a note in `## Needs follow-up`: "requires login to <site> — feature X implied by table of contents but not verified". Never pretend to have read something you didn't.

### Giant codebases that don't fit in context

Delegate completely to surface-specific subagents (parallelize). Do not try to load the full tree into the main agent. Use `colgrep` queries with progressive narrowing.

### Closed-source targets where only the website exists

Run the website extraction. Cap `[NEW]` items at `medium` confidence unless the website explicitly documents a behavior. Be extra aggressive about marking items `[?]` — absence of source makes claims harder to verify.

### Very stale repos

If the most recent commit is >12 months old, note the repo status in the summary. Evidence is still valid but the project may be dormant — reflect that in roadmap prioritization (adopting a dormant competitor's idea is often fine; copying their recent direction is not possible because there is none).

### Target uses a very different stack

Do not downgrade features because "their Erlang implementation isn't comparable to our TypeScript." Features are behaviors, not implementations. Judge the observable behavior, not the language. The one exception: runtime-specific capabilities (e.g., Erlang's OTP supervision trees) that simply don't translate — note them as `[NEW]` but tag `Suggested bundle: out-of-scope` in roadmap candidates.
