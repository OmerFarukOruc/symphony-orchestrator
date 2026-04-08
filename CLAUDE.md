# Risoluto

## Module Entrypoints

- `src/cli/index.ts` — process startup, config init
- `src/cli/services.ts` — DI wiring, all service factories
- `src/orchestrator/orchestrator.ts` — polling loop, dispatch, runtime state
- `src/agent-runner/index.ts` — Codex worker execution
- `src/http/server.ts` + `src/http/routes/` — HTTP server and dashboard
- `src/persistence/sqlite/` — archived run persistence
- `src/workspace/manager.ts` — workspace lifecycle
- `src/linear/client.ts` — Linear transport

Tests in `tests/`; fixtures in `tests/fixtures/`. `dist/` is generated output only. Runtime docs in `docs/`

## Build, Test & Dev Commands

- `pnpm run build` — TypeScript + frontend
- `pnpm test` — Vitest suite
- `pnpm run test:watch` — watch mode
- `pnpm run test:integration` — opt-in, needs `LINEAR_API_KEY`
- `pnpm exec playwright test --project=smoke` — 119 smoke tests
- `pnpm exec playwright test --project=visual` — 4 visual baselines; `--update-snapshots` to regenerate
- `pnpm run dev -- --port 4000` — dev server via `tsx`
- `node dist/cli/index.js --port 4000` — built service

## Pre-commit & Pre-push

- **Pre-commit**: `lint-staged` — ESLint + Prettier on staged `*.ts`
- **Pre-push**: build → test → typecheck (~60s fast gate)
- `SKIP_HOOKS=1 git push` — emergency only
- `FULL_CHECK=1 git push` — full CI-mirror suite locally

### Agent Verification Checklist

Before every commit:

```bash
pnpm run build && pnpm run lint && pnpm run format:check && pnpm test
```

## Coding Style

ESM TypeScript (`moduleResolution: "NodeNext"`), 2-space indent, double quotes, semicolons, `const` by default. Local imports use `.js` extensions (`import { Foo } from "./foo.js"`). `PascalCase` classes, `camelCase` functions/variables, `*.test.ts` test files.

## Testing

Add Vitest coverage for every behavior change. Prefer deterministic unit tests; use `tests/fixtures/` over live services.

**MANDATORY after UI changes:** Invoke `/visual-verify` after editing any CSS, `dashboard-template.ts`, or `logs-template.ts`. Required before marking UI tasks done.

## Watch Mode

When I say "watch mode", call `agentation_watch_annotations` in a loop. Acknowledge → fix → resolve with summary. Continue until I say stop or timeout.

## agent-ci

- `npx @redwoodjs/agent-ci run --quiet --workflow .github/workflows/ci.yml` — run CI locally
- On step failure: `npx @redwoodjs/agent-ci retry --name <runner>` after fixing
- Do NOT push to trigger remote CI — use agent-ci locally instead
- CI was green before you started; any failure is caused by your changes

## Design System

Frontend design tokens, component vocabulary, and brand guidelines in `.impeccable.md`. Consult before any UI work. `mc-*` prefix for all component classes.
