# Repository Guidelines

## Project Structure & Module Organization

Core source lives in `src/`. Start with `src/cli.ts` for process startup and archive directory setup, `src/orchestrator.ts` for polling, retries, runtime state, and model overrides, and `src/agent-runner.ts` for Codex worker execution. HTTP and dashboard behavior live in `src/http-server.ts` and `src/dashboard-template.ts`. Archived run persistence lives in `src/attempt-store.ts`, workspace lifecycle in `src/workspace-manager.ts`, and Linear transport in `src/linear-client.ts`.

Tests live in `tests/` and use fixture data from `tests/fixtures/`. Built artifacts are emitted to `dist/`; treat that directory as generated output, not hand-edited source. Runtime docs and operator guidance live in `README.md`, `WORKFLOW.example.md`, `WORKFLOW.md`, `docs/OPERATOR_GUIDE.md`, `docs/ROADMAP_AND_STATUS.md`, `docs/RELEASING.md`, and `docs/TRUST_AND_AUTH.md`. `EXECPLAN.md` is the implementation log and should stay factual when behavior changes.

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

## Refactoring Guidelines

Keep classes, modules, and functions small, atomic, and focused on a single responsibility. Do not let implementations grow long or mixed-purpose; extract well-named helpers or smaller modules early. Prefer modular, structured composition that is easy to read, test, and change.

## Documentation Expectations

Keep the doc set role-oriented:

- `README.md` explains what Symphony is, what ships now, and how to get started.
- `docs/OPERATOR_GUIDE.md` covers setup, runtime behavior, and common operating tasks.
- `docs/ROADMAP_AND_STATUS.md` records shipped capabilities, current scope, and verified remaining gaps.
- `docs/RELEASING.md` captures the release checklist.
- `docs/TRUST_AND_AUTH.md` documents trust boundaries and auth expectations.
- `EXECPLAN.md` remains the implementation log and should not drift into stale roadmap claims.

## Commit & Pull Request Guidelines

This checkout may not include `.git`, so local history may not be available to inspect. Until history is available, use short imperative commit subjects or, when the repository becomes fully git-backed, conventional commit style such as `docs: refresh operator guide` or `feat: add archived attempt timeline`.

PRs should explain the operator-visible impact, list validation steps (`npm test`, `npm run build`), and link the related issue. Include logs, API examples, or dashboard screenshots when changing runtime status, auth behavior, archived attempts, or the local UI.

## Security & Configuration Tips

Keep secrets out of committed workflow files; prefer env expansion such as `$LINEAR_API_KEY`. When changing auth, trust, workflow examples, or sandbox behavior, update `docs/TRUST_AND_AUTH.md` and any affected operator docs in the same PR.
