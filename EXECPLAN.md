# EXECPLAN.md

Implementation log for Symphony Orchestrator.

---

## 2026-03-26: Tech Stack Migration Completed

Migrated the project to a modern, consolidated tech stack:

### Package Manager

- **Before**: Mixed npm/yarn usage
- **After**: pnpm exclusively
- **Impact**: Faster installs, better disk usage, consistent lockfile

### HTTP Framework

- **Before**: Express server
- **After**: Fastify 5
- **Impact**: Better performance, built-in schema validation, native SSE support

### Persistence Layer

- **Before**: File-based JSON archives (`.symphony/issue-index.json`, `attempts/*.json`, `events/*.jsonl`)
- **After**: SQLite via Drizzle ORM (`symphony.db`)
- **Impact**: Better query performance, ACID transactions, single file backup

### Frontend Framework

- **Before**: Vanilla TypeScript with EJS templates
- **After**: React 19 + TanStack Query + React Router v7
- **Impact**: Component-based architecture, better state management

### Logging

- **Before**: Winston
- **After**: Pino
- **Impact**: Structured JSON logging, better performance, industry standard

### Node.js Runtime

- **Before**: Node.js 22
- **After**: Node.js 24
- **Impact**: Latest features, security updates

### Files Changed

- `README.md` — Updated badges, feature list, tech stack description
- `docs/OPERATOR_GUIDE.md` — Updated prerequisites, SQLite documentation
- `docs/GETTING_STARTED.md` — Updated Node.js version requirement
- `docs/RUNBOOKS.md` — Updated Node.js version requirement
- `CLAUDE.md` — Updated Node.js version requirement
- `AGENTS.md` — Updated Node.js version requirement

### Migration Notes for Operators

The SQLite database is automatically created at `.symphony/symphony.db` on first run. Historical file-based archives are no longer used. To migrate data from old file-based archives, manual export/import is required (not automated).

---

</content>
