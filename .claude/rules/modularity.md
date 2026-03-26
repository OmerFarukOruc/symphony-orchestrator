---
paths:
  - "src/**/*.ts"
  - "packages/**/*.ts"
description: File/function size limits and extraction patterns enforced by ESLint and team convention.
---

# Refactoring & Modularity Guidelines

Keep classes, modules, and functions small, atomic, and focused on a single responsibility. Do not let implementations grow long or mixed-purpose; extract well-named helpers or smaller modules early. Prefer modular, structured composition that is easy to read, test, and change.

**If something can be modularized, it must be modularized.** This is not optional.

## Class & File Size Limits

ESLint enforces: **400 lines per file max, 150 lines per function max**. These are hard limits, not guidelines.

- If a class or file grows past 400 lines, extract logic into standalone functions in dedicated sub-modules. The class becomes a thin coordinator that delegates to extracted modules.
- Long functions (>150 lines) must be broken into named helper functions. If a function has multiple phases (e.g., setup → execute → cleanup), each phase should be its own function.
- Files containing only type definitions, query strings, or pure constants may exceed 400 lines if splitting would hurt readability.

## Extraction Patterns

- **Prefer standalone functions over sub-classes.** Extract logic into exported functions that receive dependencies through typed context objects, not through class inheritance. Example: `export async function handleWorkerOutcome(ctx: WorkerOutcomeContext, ...): Promise<void>`.
- **Use a context interface** when an extracted function needs access to multiple pieces of parent state. Define the interface in a dedicated `context.ts` file. The parent class provides a `ctx()` method that bundles `this.*` references.
- **Consolidate duplicate helpers.** If the same utility function (e.g., type guards, formatting, parsing) appears in more than one file, move it to `src/utils/` and import from there. Never duplicate helper functions across files.

## Module Directory Structure

When a class is large enough to warrant extraction, create a directory for its sub-modules and an index:

```
src/orchestrator/
  orchestrator.ts          ← thin coordinator; delegates to modules below
  orchestrator-delegates.ts
  lifecycle.ts
  worker-launcher.ts
  model-selection.ts
  snapshot-builder.ts
  watchdog.ts
  context.ts               ← OrchestratorState/OrchestratorDeps interfaces
```

## When Adding New Code

- Before adding code to an existing file, check its line count. If the addition would push it over 400 lines, extract existing code first to make room.
- When implementing a new feature that spans multiple concerns, start by creating separate modules — do not add everything to a single file and plan to "refactor later."
- Every PR that touches a file over 400 lines should leave that file shorter or the same length, never longer.
