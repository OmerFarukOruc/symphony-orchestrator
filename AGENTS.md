# Repository Guidelines

## Project Structure & Module Organization

Core source lives in `src/`. Start with `src/cli.ts` for process startup and archive directory setup, `src/orchestrator.ts` for polling, retries, runtime state, and model overrides, and `src/agent-runner.ts` for Codex worker execution. HTTP and dashboard behavior live in `src/http-server.ts` and `src/dashboard-template.ts`. Archived run persistence lives in `src/attempt-store.ts`, workspace lifecycle in `src/workspace-manager.ts`, and Linear transport in `src/linear-client.ts`.

Tests live in `tests/` and use fixture data from `tests/fixtures/`. Built artifacts are emitted to `dist/`; treat that directory as generated output, not hand-edited source. Runtime docs and operator guidance live in `README.md`, `WORKFLOW.example.md`, `WORKFLOW.md`, `docs/OPERATOR_GUIDE.md`, `docs/ROADMAP_AND_STATUS.md`, `docs/CONFORMANCE_AUDIT.md`, `docs/RELEASING.md`, and `docs/TRUST_AND_AUTH.md`. `EXECPLAN.md` is the implementation log and should stay factual when behavior changes.

## Build, Test, and Development Commands

Use Node.js 22 or newer.

- `npm run build` compiles TypeScript from `src/` into `dist/`.
- `npm test` runs the main Vitest suite.
- `npm run test:watch` starts Vitest in watch mode for local iteration.
- `npm run test:integration` runs the opt-in integration config; set `LINEAR_API_KEY` first when you want real credential coverage.
- `npm run dev -- ./WORKFLOW.example.md` runs the CLI directly through `tsx`.
- `node dist/cli.js ./WORKFLOW.example.md --port 4000` runs the built service.

## Coding Style & Naming Conventions

This repo uses strict ESM TypeScript with `moduleResolution: "NodeNext"`. Follow the existing style: 2-space indentation, double quotes, semicolons, `const` by default, and small focused modules. Use `PascalCase` for classes, `camelCase` for functions and variables, and keep test files named `*.test.ts`.

Match the current import pattern by using `.js` extensions in local TypeScript imports, for example `import { Orchestrator } from "./orchestrator.js";`.

## Testing Guidelines

Add or update Vitest coverage for every behavior change. Prefer deterministic unit tests in `tests/*.test.ts`; use fixtures in `tests/fixtures/` instead of live services where possible. Reserve `tests/live.integration.test.ts` for environment-dependent checks that should skip cleanly when credentials are absent.

When behavior changes affect the operator surface, verify both code and docs together. At minimum, keep `README.md`, workflow examples, and the relevant `docs/*.md` files aligned with the actual API, trust posture, and runtime behavior.

## Refactoring & Modularity Guidelines

Keep classes, modules, and functions small, atomic, and focused on a single responsibility. Do not let implementations grow long or mixed-purpose; extract well-named helpers or smaller modules early. Prefer modular, structured composition that is easy to read, test, and change.

**If something can be modularized, it must be modularized.** This is not optional.

### Class & File Size Limits

- **Classes must not exceed 200 lines.** If a class grows past this limit, extract logic into standalone functions in dedicated sub-modules. The class becomes a thin coordinator that delegates to extracted modules.
- **Files should stay under 200 lines** where practical. Files containing only type definitions, query strings, or pure constants may exceed this if splitting would hurt readability.
- **Functions should stay under 50 lines.** Long functions must be broken into named helper functions. If a function has multiple phases (e.g., setup → execute → cleanup), each phase should be its own function.

### Extraction Patterns

- **Prefer standalone functions over sub-classes.** Extract logic into exported functions that receive dependencies through typed context objects, not through class inheritance. Example: `export async function handleWorkerOutcome(ctx: WorkerOutcomeContext, ...): Promise<void>`.
- **Use a context interface** when an extracted function needs access to multiple pieces of parent state. Define the interface in a dedicated `context.ts` file. The parent class provides a `ctx()` method that bundles `this.*` references.
- **Consolidate duplicate helpers.** If the same utility function (e.g., type guards, formatting, parsing) appears in more than one file, move it to `src/utils/` and import from there. Never duplicate helper functions across files.

### Module Directory Structure

When a class is large enough to warrant extraction, create a directory for its sub-modules:

```
src/orchestrator.ts          # thin class (≤200 lines)
src/orchestrator/
  context.ts                 # shared context interface
  lifecycle.ts               # start/stop/tick logic
  worker-launcher.ts         # dispatch and launch
  worker-outcome.ts          # post-run outcome handling
  retry-manager.ts           # retry queue management
  ...
```

### When Adding New Code

- Before adding code to an existing file, check its line count. If the addition would push it over 200 lines, extract existing code first to make room.
- When implementing a new feature that spans multiple concerns, start by creating separate modules — do not add everything to a single file and plan to "refactor later."
- Every PR that touches a file over 200 lines should leave that file shorter or the same length, never longer.

## Documentation Expectations

Keep the doc set role-oriented:

- `README.md` explains what Symphony is, what ships now, and how to get started.
- `docs/OPERATOR_GUIDE.md` covers setup, runtime behavior, and common operating tasks.
- `docs/ROADMAP_AND_STATUS.md` is the issue-linked feature roadmap with all planned work across 4 tiers.
- `docs/CONFORMANCE_AUDIT.md` records shipped capabilities, spec conformance, and verified remaining gaps.
- `docs/RELEASING.md` captures the release checklist.
- `docs/TRUST_AND_AUTH.md` documents trust boundaries and auth expectations.
- `EXECPLAN.md` remains the implementation log and should not drift into stale roadmap claims.

## Commit & Pull Request Guidelines

This checkout may not include `.git`, so local history may not be available to inspect. Until history is available, use short imperative commit subjects or, when the repository becomes fully git-backed, conventional commit style such as `docs: refresh operator guide` or `feat: add archived attempt timeline`.

PRs should explain the operator-visible impact, list validation steps (`npm test`, `npm run build`), and link the related issue. Include logs, API examples, or dashboard screenshots when changing runtime status, auth behavior, archived attempts, or the local UI.

## Security & Configuration Tips

Keep secrets out of committed workflow files; prefer env expansion such as `$LINEAR_API_KEY`. When changing auth, trust, workflow examples, or sandbox behavior, update `docs/TRUST_AND_AUTH.md` and any affected operator docs in the same PR.

## Browser Automation & Visual Verification

Use `agent-browser` for visual verification of Symphony dashboard UI changes. The `visual-verify` skill in `skills/visual-verify/` teaches the full workflow. Read `skills/visual-verify/SKILL.md` whenever you need to visually verify UI changes, QA the dashboard, take screenshots, or run before/after comparisons.

**When to use:** After editing `dashboard-template.ts`, `logs-template.ts`, or any file that affects the Symphony web UI. Also use when asked to "dogfood", "QA", "visual check", or "screenshot" the dashboard.

**Quick workflow:**

1. `agent-browser open http://127.0.0.1:4000` — navigate to dashboard
2. `agent-browser screenshot --annotate archive/screenshots/before.png` — baseline
3. Make code changes
4. `agent-browser reload` — refresh
5. `agent-browser screenshot --annotate archive/screenshots/after.png` — capture
6. `agent-browser diff screenshot --baseline archive/screenshots/before.png` — pixel diff
7. `agent-browser close` — cleanup

## SonarCloud Prevention Rules

These rules prevent the recurring code quality issues identified and fixed during the SonarCloud cleanup. Follow them strictly in all new code.

### String Manipulation

- **Use `replaceAll()` for global replacements.** Never write `.replace(/pattern/g, ...)` — always use `.replaceAll(/pattern/g, ...)`. The `g` flag with `replace()` is misleading; `replaceAll()` makes intent explicit.
- **Batch `Array#push()` calls.** Merge consecutive `push()` calls into a single `push(a, b, c)` call.

### Type Safety

- **Never union `unknown` with other types.** `unknown | null`, `unknown | string`, etc. are all just `unknown`. Use `unknown` alone.
- **Remove unnecessary type assertions.** If TypeScript already infers the correct type, do not add `as SomeType` casts.
- **Throw `TypeError` for type/validation violations.** Use `new TypeError(...)` instead of `new Error(...)` when the error is about an unexpected type.
- **Prevent `[object Object]` in template literals.** Before embedding a value of type `unknown` or `object` in a template literal, explicitly check `typeof value === "string"` or use `JSON.stringify()` / `String()`.

### Regex Patterns

- **Use `\w` instead of `[A-Za-z0-9_]`.** The shorthand is equivalent and more concise.
- **Avoid duplicate characters in regex classes.** `\w` already includes `_`, so `[\w._-]` should be `[\w.-]`. Audit character classes for overlap with shorthands.

### Naming & Style

- **Prefer `.at(-1)` for last-element access.** Write `arr.at(-1)` instead of `arr[arr.length - 1]`.
- **Name catch parameters `error` or `error_`.** Use `error_` when the parameter shadows an outer `error` variable.
- **Test positive conditions first.** Write `if (x === undefined)` instead of `if (x !== undefined) { ... } else { ... }`.
- **Use top-level `await` in ESM entry points.** Prefer `process.exitCode = await main()` over `main().then(...)`.

### Deprecation & Cleanup

- **Remove deprecated type aliases immediately.** When marking a type as `@deprecated`, migrate all call sites in the same PR — do not leave deprecated references.
- **Avoid `Todo` in comments/examples.** SonarCloud flags any occurrence of `TODO` (case-insensitive). Use alternative wording in JSDoc examples (e.g. `"Triage"` instead of `"Todo"`).

---
name: desloppify
description: >
  Codebase health scanner and technical debt tracker. Use when the user asks
  about code quality, technical debt, dead code, large files, god classes,
  duplicate functions, code smells, naming issues, import cycles, or coupling
  problems. Also use when asked for a health score, what to fix next, or to
  create a cleanup plan. Supports 29 languages.
---

<!-- desloppify-begin -->
<!-- desloppify-skill-version: 6 -->

# Desloppify

## 1. Your Job

Maximise the **strict score** honestly. Your main cycle: **scan → plan → execute → rescan**. Follow the scan output's **INSTRUCTIONS FOR AGENTS** — don't substitute your own analysis.

**Don't be lazy.** Do large refactors and small detailed fixes with equal energy. If it takes touching 20 files, touch 20 files. If it's a one-line change, make it. No task is too big or too small — fix things properly, not minimally.

## 2. The Workflow

Three phases, repeated as a cycle.

### Phase 1: Scan and review — understand the codebase

```bash
desloppify scan --path .       # analyse the codebase
desloppify status              # check scores — are we at target?
```

The scan will tell you if subjective dimensions need review. Follow its instructions. To trigger a review manually:
```bash
desloppify review --prepare    # then follow your runner's review workflow
```

### Phase 2: Plan — decide what to work on

After reviews, triage stages and plan creation appear in the execution queue surfaced by `next`. Complete them in order — `next` tells you what each stage expects in the `--report`:
```bash
desloppify next                                        # shows the next execution workflow step
desloppify plan triage --stage observe --report "themes and root causes..."
desloppify plan triage --stage reflect --report "comparison against completed work..."
desloppify plan triage --stage organize --report "summary of priorities..."
desloppify plan triage --complete --strategy "execution plan..."
```

For automated triage: `desloppify plan triage --run-stages --runner codex` (Codex) or `--runner claude` (Claude). Options: `--only-stages`, `--dry-run`, `--stage-timeout-seconds`.

Then shape the queue. **The plan shapes everything `next` gives you** — `next` is the execution queue, not the full backlog. Don't skip this step.

```bash
desloppify plan                          # see the living plan details
desloppify plan queue                    # compact execution queue view
desloppify plan reorder <pat> top        # reorder — what unblocks the most?
desloppify plan cluster create <name>    # group related issues to batch-fix
desloppify plan focus <cluster>          # scope next to one cluster
desloppify plan skip <pat>              # defer — hide from next
```

### Phase 3: Execute — grind the queue to completion

Trust the plan and execute. Don't rescan mid-queue — finish the queue first.

**Branch first.** Create a dedicated branch — never commit health work directly to main:
```bash
git checkout -b desloppify/code-health    # or desloppify/<focus-area>
desloppify config set commit_pr 42        # link a PR for auto-updated descriptions
```

**The loop:**
```bash
# 1. Get the next item from the execution queue
desloppify next

# 2. Fix the issue in code

# 3. Resolve it (next shows the exact command including required attestation)

# 4. When you have a logical batch, commit and record
git add <files> && git commit -m "desloppify: fix 3 deferred_import findings"
desloppify plan commit-log record      # moves findings uncommitted → committed, updates PR

# 5. Push periodically
git push -u origin desloppify/code-health

# 6. Repeat until the queue is empty
```

Score may temporarily drop after fixes — cascade effects are normal, keep going.
If `next` suggests an auto-fixer, run `desloppify autofix <fixer> --dry-run` to preview, then apply.

**When the queue is clear, go back to Phase 1.** New issues will surface, cascades will have resolved, priorities will have shifted. This is the cycle.

## 3. Reference

### Key concepts

- **Tiers**: T1 auto-fix → T2 quick manual → T3 judgment call → T4 major refactor.
- **Auto-clusters**: related findings are auto-grouped in `next`. Drill in with `next --cluster <name>`.
- **Zones**: production/script (scored), test/config/generated/vendor (not scored). Fix with `zone set`.
- **Wontfix cost**: widens the lenient↔strict gap. Challenge past decisions when the gap grows.

### Scoring

Overall score = **25% mechanical** + **75% subjective**.

- **Mechanical (25%)**: auto-detected issues — duplication, dead code, smells, unused imports, security. Fixed by changing code and rescanning.
- **Subjective (75%)**: design quality review — naming, error handling, abstractions, clarity. Starts at **0%** until reviewed. The scan will prompt you when a review is needed.
- **Strict score** is the north star: wontfix items count as open. The gap between overall and strict is your wontfix debt.
- **Score types**: overall (lenient), strict (wontfix counts), objective (mechanical only), verified (confirmed fixes only).

### Reviews

Four paths to get subjective scores:

- **Local runner (Codex)**: `desloppify review --run-batches --runner codex --parallel --scan-after-import` — automated end-to-end.
- **Local runner (Claude)**: `desloppify review --prepare` → launch parallel subagents → `desloppify review --import merged.json` — see skill doc overlay for details.
- **Cloud/external**: `desloppify review --external-start --external-runner claude` → follow session template → `--external-submit`.
- **Manual path**: `desloppify review --prepare` → review per dimension → `desloppify review --import file.json`.

**Batch output vs import filenames:** Individual batch outputs from subagents must be named `batch-N.raw.txt` (plain text/JSON content, `.raw.txt` extension). The `.json` filenames in `--import merged.json` or `--import findings.json` refer to the final merged import file, not individual batch outputs. Do not name batch outputs with a `.json` extension.

- Import first, fix after — import creates tracked state entries for correlation.
- Target-matching scores trigger auto-reset to prevent gaming. Use the blind-review workflow described in your agent overlay doc (e.g. `docs/CLAUDE.md`, `docs/HERMES.md`).
- Even moderate scores (60-80) dramatically improve overall health.
- Stale dimensions auto-surface in `next` — just follow the queue.

**Integrity rules:** Score from evidence only — no prior chat context, score history, or target-threshold anchoring. When evidence is mixed, score lower and explain uncertainty. Assess every requested dimension; never drop one.

#### Review output format

Return machine-readable JSON for review imports. For `--external-submit`, include `session` from the generated template:

```json
{
  "session": {
    "id": "<session_id_from_template>",
    "token": "<session_token_from_template>"
  },
  "assessments": {
    "<dimension_from_query>": 0
  },
  "findings": [
    {
      "dimension": "<dimension_from_query>",
      "identifier": "short_id",
      "summary": "one-line defect summary",
      "related_files": ["relative/path/to/file.py"],
      "evidence": ["specific code observation"],
      "suggestion": "concrete fix recommendation",
      "confidence": "high|medium|low"
    }
  ]
}
```

`findings` MUST match `query.system_prompt` exactly (including `related_files`, `evidence`, and `suggestion`). Use `"findings": []` when no defects found. Import is fail-closed: invalid findings abort unless `--allow-partial` is passed. Assessment scores are auto-applied from trusted internal or cloud session imports. Legacy `--attested-external` remains supported.

#### Import paths

- Robust session flow (recommended): `desloppify review --external-start --external-runner claude` → use generated prompt/template → run printed `--external-submit` command.
- Durable scored import (legacy): `desloppify review --import findings.json --attested-external --attest "I validated this review was completed without awareness of overall score and is unbiased."`
- Findings-only fallback: `desloppify review --import findings.json`

#### Reviewer agent prompt

Runners that support agent definitions (Cursor, Copilot, Gemini) can create a dedicated reviewer agent. Use this system prompt:

```
You are a code quality reviewer. You will be given a codebase path, a set of
dimensions to score, and what each dimension means. Read the code, score each
dimension 0-100 from evidence only, and return JSON in the required format.
Do not anchor to target thresholds. When evidence is mixed, score lower and
explain uncertainty.
```

See your editor's overlay section below for the agent config format.

### Plan commands

```bash
desloppify plan reorder <cluster> top       # move all cluster members at once
desloppify plan reorder <a> <b> top        # mix clusters + findings in one reorder
desloppify plan reorder <pat> before -t X  # position relative to another item/cluster
desloppify plan cluster reorder a,b top    # reorder multiple clusters as one block
desloppify plan resolve <pat>              # mark complete
desloppify plan reopen <pat>               # reopen
desloppify backlog                          # broader non-execution backlog
```

### Commit tracking

```bash
desloppify plan commit-log                      # see uncommitted + committed status
desloppify plan commit-log record               # record HEAD commit, update PR description
desloppify plan commit-log record --note "why"  # with rationale
desloppify plan commit-log record --only "smells::*"  # record specific findings only
desloppify plan commit-log history              # show commit records
desloppify plan commit-log pr                   # preview PR body markdown
desloppify config set commit_tracking_enabled false  # disable guidance
```

After resolving findings as `fixed`, the tool shows uncommitted work, committed history, and a suggested commit message. After committing externally, run `record` to move findings from uncommitted to committed and auto-update the linked PR description.

### Agent directives

Directives are messages shown to agents at lifecycle phase transitions — use them to switch models, set constraints, or give context-specific instructions.

```bash
desloppify directives                     # show all configured directives
desloppify directives set execute "Switch to claude-sonnet-4-6. Focus on speed."
desloppify directives set triage "Switch to claude-opus-4-6. Read carefully."
desloppify directives set review "Use blind packet. Do not anchor on previous scores."
desloppify directives unset execute       # remove a directive
```

Available phases: `execute`, `review`, `triage`, `workflow`, `scan` (and fine-grained variants like `review_initial`, `triage_postflight`, etc.).

### Quick reference

```bash
desloppify next --count 5                         # top 5 execution items
desloppify next --cluster <name>                  # drill into a cluster
desloppify backlog --count 5                      # top 5 backlog items outside execution
desloppify show <pattern>                         # filter by file/detector/ID
desloppify show --status open                     # all open findings
desloppify plan skip --permanent "<id>" --note "reason" --attest "..." # accept debt
desloppify exclude <path>                         # exclude a directory from scanning
desloppify config show                            # show all config including excludes
desloppify scan --path . --reset-subjective       # reset subjective baseline to 0
```

## 4. Fix Tool Issues Upstream

When desloppify itself appears wrong or inconsistent — a bug, a bad detection, a crash, confusing output — **fix it and open a PR**. If you can't confidently fix it, file an issue instead.

### Fix and PR (preferred)

Clone the tool repo to a temp directory, make the fix there, and verify it works against the project you're scanning before pushing.

```bash
git clone https://github.com/peteromallet/desloppify.git /tmp/desloppify-fix
cd /tmp/desloppify-fix
git checkout -b fix/<short-description>
```

Make your changes, then run the test suite and verify the fix against the original project:

```bash
python -m pytest desloppify/tests/ -q
python -m desloppify scan --path <project-root>   # the project you were scanning
```

Once it looks good, push and open a PR:

```bash
git add <files> && git commit -m "fix: <what and why>"
git push -u origin fix/<short-description>
gh pr create --title "fix: <short description>" --body "$(cat <<'EOF'
## Problem
<what went wrong — include the command and output>

## Fix
<what you changed and why>
EOF
)"
```

Clean up after: `rm -rf /tmp/desloppify-fix`

### File an issue (fallback)

If the fix is unclear or the change needs discussion, open an issue at `https://github.com/peteromallet/desloppify/issues` with a minimal repro: command, path, expected output, actual output.

## Prerequisite

`command -v desloppify >/dev/null 2>&1 && echo "desloppify: installed" || echo "NOT INSTALLED — run: uvx --from git+https://github.com/peteromallet/desloppify.git desloppify"`

If `uvx` is not available: `pip install desloppify[full]`

<!-- desloppify-end -->

## Gemini CLI Overlay

Gemini CLI has experimental subagent support, but subagents currently run
sequentially (not in parallel). Review dimensions one at a time.

### Setup

Enable subagents in Gemini CLI settings:
```json
{
  "experimental": {
    "enableAgents": true
  }
}
```

Optionally define a reviewer agent in `.gemini/agents/desloppify-reviewer.md`:

```yaml
---
name: desloppify-reviewer
description: Scores subjective codebase quality dimensions for desloppify
kind: local
tools:
  - read_file
  - search_code
temperature: 0.2
max_turns: 10
---
```

Use the prompt from the "Reviewer agent prompt" section above.

### Review workflow

Invoke the reviewer agent for each group of dimensions sequentially.
Even without parallelism, isolating dimensions across separate agent
invocations prevents score bleed between concerns.

Merge assessments and findings, then import.

When Gemini CLI adds parallel subagent execution, split dimensions across
concurrent agent calls instead.

<!-- desloppify-overlay: gemini -->
<!-- desloppify-end -->
