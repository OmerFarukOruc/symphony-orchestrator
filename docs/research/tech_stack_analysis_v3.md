# Symphony Orchestrator: Tech Stack Rewrite Analysis (v3)

## Executive Answer

If we were rewriting Symphony from scratch today with effectively unlimited resources, I would build it as a **local-first typed control plane**:

- **Runtime:** Node.js 24
- **Backend:** Fastify + TypeBox + generated OpenAPI
- **Frontend:** React 19 + React Router + TanStack Query
- **Build tooling:** Vite
- **Package manager:** pnpm
- **Styling:** CSS Modules + global design tokens via CSS custom properties
- **Realtime:** Server-Sent Events (SSE)
- **Persistence:** SQLite + Drizzle ORM
- **Secrets:** pluggable secret backend
- Desktop/local mode: OS keychain when available
- Headless/server mode: encrypted file-store fallback
- **Logging:** Pino
- **Metrics:** prom-client
- **Tracing:** optional OpenTelemetry, added only if cross-process tracing proves worth the cost
- **Testing:** Vitest + Playwright
- **Worker isolation:** Docker
- **Desktop shell:** Tauri 2

This is not a vote for "more framework because we can." It is a vote for using stronger primitives where Symphony has already grown beyond custom-tooling comfort.

Confidence: **9/10**

---

## What Symphony Actually Is

Symphony is not just a small dashboard or a polling script. It is a **local orchestration product** with multiple layers:

- a Linear-driven orchestration loop
- Docker sandbox lifecycle and worker isolation
- multi-turn Codex execution management
- setup and onboarding flows
- encrypted secrets management
- config overlay persistence and mutation
- a fairly large operator UI
- optional remote dispatch/data-plane support
- notifications, metrics, run history, git automation, and a desktop shell

Evidence in the repo:

- `src/orchestrator/orchestrator.ts`
- `src/setup/api.ts`
- `src/secrets/store.ts`
- `src/config/overlay.ts`
- `src/dispatch/server.ts`
- `src/docker/spawn.ts`
- `desktop/src-tauri/src/main.rs`
- `frontend/src/main.ts`
- `frontend/src/api.ts`

The current frontend alone is already substantial:

- **124 TypeScript files**
- **42 files** under `frontend/src/views/`
- **12,196 lines** of frontend TypeScript
- a production main JS chunk of about **414 KB**

That matters, because the right rewrite choice is driven more by product scope and operational shape than by ideology.

---

## Final Recommendation By Layer

### 1. Runtime

**Choose:** `Node.js 24`

Why:

- Symphony is already deeply coupled to Node strengths: subprocesses, filesystem work, Docker CLI invocation, streaming, and ESM TypeScript.
- A rewrite should target the current LTS track, not preserve the current floor out of inertia.
- There is no compelling reason here to switch to Bun or Deno.

What we lose:

- Nothing meaningful. This is mostly a straightforward modernization from the current `>=22` stance.

---

### 2. Backend Framework

**Choose:** `Fastify`

Why:

- Symphony already has enough API surface that validation, serialization, lifecycle hooks, and contract generation matter more than minimalism.
- The current Express setup is thin and clean, but it still spreads request validation and shape handling across hand-written route code.
- Fastify gives us a better center of gravity for a typed control plane than either current Express or a smaller minimalist framework.

Repo evidence:

- `src/http/server.ts`
- `src/http/routes.ts`
- `src/config/api.ts`
- `src/secrets/api.ts`
- `src/setup/api.ts`
- `src/dispatch/server.ts`

Why not Hono:

- Hono is appealing for small, standards-oriented APIs.
- Symphony is now big enough that schema-backed route definitions, plugins, and generated docs are more valuable than shaving framework size.

What we lose:

- Some conceptual simplicity.
- Fastify asks for a little more structure up front.

That trade is worth it here.

---

### 3. API Contracts

**Choose:** `TypeBox` + Fastify type provider + generated `OpenAPI`

Why:

- Today there are many custom `isRecord()`-style validations and request-shape checks.
- A rewrite should centralize contract definitions instead of re-implementing validation route by route.
- OpenAPI becomes useful here not as marketing docs, but as a source of truth for frontend types, testing, and future integrations.

Repo evidence:

- `src/config/api.ts`
- `src/secrets/api.ts`
- `src/setup/api.ts`
- `src/http/model-handler.ts`
- `src/http/transition-handler.ts`

What we gain:

- typed request/response contracts
- less hand-written validation code
- easier API testing
- better frontend/backend alignment

---

### 4. Frontend Architecture

**Choose:** `React 19` + `React Router` + `TanStack Query`

This is the biggest judgment call in the document, and it is also where I most clearly disagree with the Preact-first version.

Why React over Preact:

- The real problem is not raw bundle size. The real problem is **UI and data complexity**.
- The client already handles runtime snapshots, attempts, transitions, config, secrets, setup flows, device auth, and mutations across many endpoints.
- React Router and TanStack Query solve problems the current app already has: route-based data ownership, mutation flows, cache invalidation, background refresh, optimistic updates where useful, and loading/error states.
- The current app is already paying framework-level complexity without framework-level leverage.

Repo evidence:

- `frontend/src/main.ts`
- `frontend/src/router.ts`
- `frontend/src/api.ts`
- `frontend/src/state/store.ts`
- `frontend/src/state/polling.ts`
- `frontend/src/views/setup-view.ts`
- `frontend/src/views/settings-helpers.ts`

Why not stay custom:

- `frontend/src/state/store.ts` is already implementing app-wide merge and event semantics.
- `frontend/src/state/polling.ts` is already coordinating stale state and visibility-aware refresh.
- Large imperative views are effectively manually implemented component trees.

Why not Preact as the primary recommendation:

- Preact is a valid fallback if minimizing runtime weight is the dominant goal.
- But with unlimited resources, I would optimize for **ecosystem leverage and maintainability**, not for saving a few tens of kilobytes on a local operator tool.
- React Router and TanStack Query have stronger defaults, more established patterns, and more operational depth for the kind of UI Symphony is becoming.

What we lose:

- slightly larger runtime than Preact
- more dependency surface than a hand-rolled SPA

What we gain is much larger than what we lose.

---

### 5. Frontend Build Tooling

**Choose:** `Vite`

Why:

- The current Vite setup is already the right shape.
- It is fast, simple, and well-aligned with a React-based rewrite.

Repo evidence:

- `frontend/vite.config.ts`

What we lose:

- Nothing. Keep it.

---

### 6. Package Manager

**Choose:** `pnpm`

Why:

- Better workspace ergonomics
- Better dependency hygiene
- Better install characteristics
- No meaningful downside for this codebase

This is an easy day-one improvement.

---

### 7. CSS Strategy

**Choose:** `CSS Modules` + global token layer with CSS custom properties

Why:

- Symphony already has a thoughtful design language and token-based styling direction.
- It does not need Tailwind to become maintainable.
- It does need tighter style ownership and better co-location.

Repo evidence:

- `DESIGN.md`
- `frontend/src/styles/tokens.css`
- `frontend/src/styles/primitives.css`
- `frontend/src/styles/components.css`
- `frontend/src/main.ts`

Recommended shape:

- keep one global token/theme layer
- keep one small global primitives/layout layer
- move page and component styling into CSS Modules

Why not Tailwind:

- Symphony already has a concrete visual system.
- Utility-first styling would not solve the main problems here.
- It would likely add churn without improving architecture.

---

### 8. Realtime Updates

**Choose:** `SSE`

Why:

- The dashboard is a server-to-client push problem, not a full duplex collaboration problem.
- SSE is simpler than WebSockets and better aligned with Symphony's current needs.
- The repo already uses SSE patterns in the dispatch plane.

Repo evidence:

- `frontend/src/state/polling.ts`
- `frontend/src/state/store.ts`
- `src/dispatch/server.ts`
- `src/dispatch/client.ts`

Recommended model:

- keep query-based initial data load
- use SSE for live updates and invalidation events
- reserve polling only as fallback/reconnect behavior

What we lose:

- the simplicity of `setInterval`

That is an easy trade to make.

---

### 9. Persistence

**Choose:** `SQLite` + `Drizzle ORM`

This is the single highest-leverage architectural change.

Why:

- Current persistence is split across multiple custom file-based systems.
- Attempts, events, config, and operational metadata want queryability, transactions, filtering, and predictable startup behavior.
- SQLite is ideal for a local-first single-node control plane.

Repo evidence:

- `src/core/attempt-store.ts`
- `src/config/overlay.ts`
- `src/secrets/store.ts`

What should move to SQLite:

- attempts
- attempt events
- issue-level runtime metadata
- config overlay values
- model overrides
- run history and indexing metadata

Why Drizzle:

- strong TypeScript ergonomics
- lightweight enough for this app
- good fit for SQLite

What we lose:

- direct file inspection with `cat`
- some of the naive simplicity of append-only files

What we gain:

- proper querying
- less startup scanning
- cleaner data evolution
- easier history views and analytics

---

### 10. Secrets

**Choose:** `pluggable secret backend`

This is the place where I do **not** want a one-size-fits-all answer.

Recommended model:

- **Desktop/local environment:** use OS keychain integration when available
- **Headless/server environment:** use encrypted file-store fallback

Why:

- Symphony clearly has both a local desktop-ish mode and a headless/server-capable mode.
- The current encrypted file-store approach fits headless and Docker-centric usage well.
- But if Symphony becomes a stronger desktop product, not using available OS secret storage leaves UX on the table.

Repo evidence:

- `src/secrets/store.ts`
- `src/setup/api.ts`
- `README.md`
- `desktop/README.md`

Important nuance:

- I would **not** put raw secrets in a plain SQLite table and call it done.
- If we store secret metadata in SQLite, the secret material should still live behind a dedicated secret provider abstraction.

What we lose:

- one unified implementation path

What we gain:

- better fit across both actual deployment modes

---

### 11. Logging

**Choose:** `Pino`

Why:

- The current logger wrapper already looks like code that wants to be Pino.
- Pino fits Symphony's structured logging style better than Winston.

Repo evidence:

- `src/core/logger.ts`

This is a clean simplification.

---

### 12. Metrics And Tracing

**Choose:** `prom-client` for metrics, `OpenTelemetry` only if justified later

Why:

- The current hand-rolled metrics collector is respectable, but this is a solved problem.
- Prometheus metrics should use the standard Node library.
- OpenTelemetry is useful only if we actually need trace continuity across the control plane, dispatch plane, and worker lifecycle.

Repo evidence:

- `src/observability/metrics.ts`
- `src/observability/tracing.ts`

Recommended stance:

- day one: Pino + prom-client + request IDs
- later: add OTel if operational value is clear

This keeps the rewrite disciplined.

---

### 13. Testing

**Choose:** `Vitest` + `Playwright`

Why:

- The current test suite is already healthy and fast.
- But the setup wizard, operator flows, and route-heavy UI need real browser coverage.

Repo evidence:

- `tests/`
- `tests/frontend/`
- `tests/http/`
- `tests/integration/`
- `frontend/src/views/setup-view.ts`

Recommended split:

- Vitest for unit and service-level integration tests
- Playwright for setup flow, dashboard behavior, config/secrets flows, and critical mutations
- keep Docker integration tests for sandbox lifecycle confidence

---

### 14. Desktop Shell

**Choose:** `Tauri 2`

Why:

- The current desktop layer is already intentionally thin.
- That is the right shape: Symphony's real product logic should stay in the TypeScript service, not fork into a separate desktop backend.

Repo evidence:

- `desktop/README.md`
- `desktop/src-tauri/Cargo.toml`
- `desktop/src-tauri/src/main.rs`

Keep the shell thin.

---

### 15. Worker Isolation

**Choose:** `Docker`

Why:

- This is one of the strongest existing architectural choices.
- It cleanly matches the trust boundary and operational model.

Repo evidence:

- `src/docker/spawn.ts`
- `src/agent-runner/`
- `docker-compose.yml`

I would not replace this with a lighter abstraction just because it is a rewrite.

---

## What I Would Not Choose

I would **not** choose:

- a custom DOM SPA again
- Hono as the default backend framework for this project
- WebSockets as the primary live-update mechanism
- Tailwind as the primary styling strategy
- file-only persistence for all operational data
- microservices as the default architecture

The right rewrite is a **modular monolith**, not a distributed system and not a handcrafted minimalist app.

---

## Recommended Architecture Shape

### Backend

- one Fastify application
- schema-defined routes
- service modules for orchestrator, dispatch, git, notifications, setup, secrets
- SQLite-backed repositories via Drizzle
- SSE endpoint for live state and event delivery

### Frontend

- React route modules
- TanStack Query for server state
- local component state only where local UI behavior actually needs it
- shared design tokens and CSS Modules

### Persistence

- SQLite for operational state and history
- secret provider abstraction for sensitive material
- filesystem only for artifacts that genuinely belong as files

---

## Migration Priority

If we were doing the rewrite in order of importance, I would prioritize it like this:

1. **Data model and persistence**
2. **Typed backend contracts**
3. **Frontend architecture**
4. **Realtime transport**
5. **Observability and logging cleanup**
6. **Package/runtime modernization**

That order matters. If we get the data and contracts right first, the UI rewrite becomes much cleaner.

---

## Honest Tradeoffs

What we gain:

- much stronger type boundaries
- less bespoke state/event plumbing
- a queryable operational history
- a more maintainable UI
- cleaner API evolution
- better testing of real user flows

What we lose:

- some of the elegance of a low-dependency hand-built system
- easy file-level inspectability for everything
- a bit of conceptual minimalism

I think those are acceptable losses.

---

## Final Call

If I had to pick one stack for the rewrite and commit to it, it would be:

- **Node 24**
- **Fastify**
- **TypeBox**
- **OpenAPI generation**
- **React 19**
- **React Router**
- **TanStack Query**
- **Vite**
- **pnpm**
- **CSS Modules + design tokens**
- **SSE**
- **SQLite + Drizzle**
- **Pino**
- **prom-client**
- **Vitest + Playwright**
- **Docker**
- **Tauri 2**
- **secret provider abstraction with keychain-or-file backends**

That is the stack I believe gives Symphony the best long-term shape.

---

## Verification Notes

This recommendation is grounded in the current repository, including:

- backend architecture under `src/`
- frontend architecture under `frontend/src/`
- tests under `tests/`
- docs including `README.md`, `DESIGN.md`, and `docs/OPERATOR_GUIDE.md`

I also verified the repo health while reviewing:

- `npm test` passed
- `npm run build` passed

The current frontend build output includes a main chunk of about **414.54 kB**, which is part of why I do not think "avoid React to save bundle size" is the right primary optimization.
