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

-  If a class grows past this limit, extract logic into standalone functions in dedicated sub-modules. The class becomes a thin coordinator that delegates to extracted modules.
- Files containing only type definitions, query strings, or pure constants may exceed this if splitting would hurt readability.
- Long functions must be broken into named helper functions. If a function has multiple phases (e.g., setup → execute → cleanup), each phase should be its own function.

### Extraction Patterns

- **Prefer standalone functions over sub-classes.** Extract logic into exported functions that receive dependencies through typed context objects, not through class inheritance. Example: `export async function handleWorkerOutcome(ctx: WorkerOutcomeContext, ...): Promise<void>`.
- **Use a context interface** when an extracted function needs access to multiple pieces of parent state. Define the interface in a dedicated `context.ts` file. The parent class provides a `ctx()` method that bundles `this.*` references.
- **Consolidate duplicate helpers.** If the same utility function (e.g., type guards, formatting, parsing) appears in more than one file, move it to `src/utils/` and import from there. Never duplicate helper functions across files.

### Module Directory Structure

When a class is large enough to warrant extraction, create a directory for its sub-modules:

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

## Security & Configuration Tips

Keep secrets out of committed workflow files; prefer env expansion such as `$LINEAR_API_KEY`. When changing auth, trust, workflow examples, or sandbox behavior, update `docs/TRUST_AND_AUTH.md` and any affected operator docs in the same PR.

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

**When to use:** After editing `dashboard-template.ts`, `logs-template.ts`, or any file that affects the Symphony web UI. Also use when asked to "dogfood", "QA", "visual check", or "screenshot" the dashboard. Read `skills/visual-verify/SKILL.md` for the full visual-verify workflow.

**Brave auto-connect:** Brave runs with `--remote-debugging-port=9222`; `autoConnect` is set in `agent-browser.json`, so no new window is opened.

**Core workflow:**

1. `agent-browser open <url>` — navigate to page
2. `agent-browser snapshot -i` — get interactive elements with refs (`@e1`, `@e2`)
3. `agent-browser click @e1` / `fill @e2 "text"` — interact using refs
4. Re-snapshot after page changes
5. `agent-browser errors` / `agent-browser console` — check for JS errors after UI changes

## Semantic Code Search (CocoIndex)

This project is indexed with [cocoindex-code](https://github.com/cocoindex-io/cocoindex-code) using the `nomic-ai/CodeRankEmbed` embedding model (137M params, ~1 GB VRAM, GPU-accelerated, 8192-token context). An MCP server (`ccc mcp`) exposes a `search` tool for semantic code search.

**When to use semantic search vs grep:**

- **Use the `search` MCP tool** for natural language and conceptual queries: *"how does authentication work"*, *"find the retry logic"*, *"where are errors handled"*. It understands meaning, not just text.
- **Use grep/rg** for exact string matches: specific function names, variable names, imports, error messages.

**Always prefer semantic search first** when exploring unfamiliar parts of the codebase or when the exact identifier is unknown. It saves tokens and finds relevant code that keyword search would miss.

**MCP tool signature:**
```
search(query, limit=5, offset=0, refresh_index=true, languages=["typescript"], paths=["src/*"])
```

**Re-indexing:** If files have been added or changed significantly, the index auto-refreshes on search. To manually rebuild: `ccc reset && ccc index` from the project root.

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
