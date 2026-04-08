---
name: surface-harvest-qa
description: Exhaustive desktop-only surface discovery and QA for web apps, with a Risoluto-tuned workflow that inventories routes, drawers, dialogs, menus, forms, shortcuts, and state variations before assigning a terminal status to each discovered surface. Use this skill whenever the user asks to map all app surfaces, harvest routes and states, dogfood a dashboard, run full UI coverage, test every interaction, or produce a surface manifest with screenshots, issues, and explicit blocked gaps, even if they do not explicitly mention "surface harvest." Prefer this skill when breadth, evidence collection, and honest coverage accounting matter more than a small targeted smoke test.
---

# Surface Harvest QA

Start with a surface model, not with pass/fail claims.

This skill is repo-local and tuned for Risoluto, but the workflow also works for other desktop web apps when you replace the Risoluto-specific seed and setup steps.

## Core Rules

- Never claim "100% of the app" in the abstract.
- Use the strongest truthful claim instead: `100% of discovered and modeled desktop surfaces were assigned a terminal status.`
- Treat these as terminal statuses: `PASS`, `FAIL`, `FLAKY`, `BLOCKED`, `SKIP`.
- Earn every `PASS` by visiting the surface, verifying the content rendered, and confirming the interaction behaved correctly.
- Update the manifest and `issues.md` incrementally. Do not batch findings at the end.
- Prefer browser observation over source-code inspection for pass/fail decisions.
- Try to unblock a surface before marking it `BLOCKED`. Use seed scripts, API setup, network mocking, or event injection when those are available.
- For Risoluto exhaustive runs, treat `SKIP` as a temporary working state, not an acceptable closeout. Finish by converting every remaining gap into `PASS`, `FAIL`, `FLAKY`, or `BLOCKED` with a concrete unblock note.
- Re-snapshot after every DOM change. Old `@eN` refs are stale once the page mutates.

## Tooling

Use the repo-standard browser tools:

- `agent-browser` for navigation, snapshots, interaction, screenshots, recordings, network mocking, and injected page scripts
- `chrome-devtools` only when you need deeper console, DOM, CSS, network, or performance debugging than `agent-browser` provides
- `strict-command-gate.sh` for any multi-command shell batch whose output you plan to trust for coverage, especially viewport sweeps and scripted browser loops

Do not make `chrome-devtools` the source of truth for coverage accounting. Coverage still lives in the manifest, logs, screenshots, and issue artifacts.

Any shell batch that prints `command not found` is a hard failure, even if the shell exits `0`. Capture those batches into the run directory and stop immediately when the gate trips.

Read [tool-reference.md](./references/tool-reference.md) before the first browser session or when `agent-browser` behaves unexpectedly.

## Resources

Load only the references you need:

- [surface-seed.md](./references/surface-seed.md): canonical Risoluto surface inventory and route list
- [interaction-taxonomy.md](./references/interaction-taxonomy.md): type-specific interaction recipes
- [prerequisites.md](./references/prerequisites.md): expected Risoluto setup and seed data
- [output-format.md](./references/output-format.md): required artifact structure and report conventions

Use these reusable assets and helpers:

- [surface-manifest-template.md](./assets/surface-manifest-template.md): manifest scaffold
- [log-action.sh](./scripts/log-action.sh): append structured JSONL entries after every meaningful action
- [route-checklist.sh](./scripts/route-checklist.sh): generate a route-specific checklist from the seed
- [route-checkpoint.sh](./scripts/route-checkpoint.sh): stop route progress when seeded rows are missing, proof is too low, or `BLOCKED` quality is weak
- [final-skip-gate.sh](./scripts/final-skip-gate.sh): fail closeout if `SKIP` remains, seed rows are missing, blocked coverage is too high, or proof coverage is too low
- [seed-coverage-gate.sh](./scripts/seed-coverage-gate.sh): fail closeout if any seeded surface is absent from the manifest
- [sync_coverage_summary.py](./scripts/sync_coverage_summary.py): regenerate `coverage-summary.md` from the current manifest and run artifacts
- [minimal-seed.sh](./scripts/minimal-seed.sh): lightweight local seeding when full credentials are unavailable
- [seed-test-data.sh](./scripts/seed-test-data.sh): full Risoluto seed workflow when real credentials exist
- [generate-report.sh](./scripts/generate-report.sh): build `report.html` from run artifacts
- [validate-run-artifacts.sh](./scripts/validate-run-artifacts.sh): fail closeout if retained logs, screenshots, or report totals are inconsistent

## Inputs and Outputs

Typical inputs:

- a local app URL or the default Risoluto localhost URL
- an authenticated session or seedable local environment
- a requested coverage scope such as "all pages", "every dialog", "desktop only", or "full dashboard QA"

Required outputs for a full run:

- a surface manifest with one terminal status per discovered surface
- screenshots and optional recordings tied to concrete surfaces
- an issues file with reproducible failures
- a coverage summary that calls out blocked or skipped surfaces explicitly
- a generated HTML report when the run is large enough to benefit from one

Treat these outputs as the definition of done for exhaustive runs.

## Reference Loading Guide

Use the references selectively so the skill stays lean:

- Read [prerequisites.md](./references/prerequisites.md) when setup, auth, or seed data look incomplete.
- Read [surface-seed.md](./references/surface-seed.md) before any Risoluto-wide pass or when the user wants exhaustive route coverage.
- Read [interaction-taxonomy.md](./references/interaction-taxonomy.md) when a surface type needs a concrete interaction recipe.
- Read [output-format.md](./references/output-format.md) before writing the final manifest, summary, or issue report.

## Default Operating Mode

- Run in headed desktop mode.
- Default target URL: `http://127.0.0.1:${APP_PORT:-4000}`
- Default output root: `${SURFACE_HARVEST_OUTPUT_ROOT:-.context/surface-harvest/}`
- Default primary viewport: `2560x1440`
- Add a `1920x1080` layout pass when the user asks for exhaustive desktop coverage or when layout regressions matter.
- For Risoluto exhaustive runs, do both: deep pass at `2560x1440`, then layout pass at `1920x1080`.

## Workflow

### 1. Preflight and seed

Set stable paths first:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
SKILL_DIR="${REPO_ROOT}/.agents/skills/surface-harvest-qa"
PORT="${APP_PORT:-4000}"
TIMESTAMP="$(date +%Y-%m-%dT%H-%M-%S)"
OUTPUT_ROOT="${SURFACE_HARVEST_OUTPUT_ROOT:-${REPO_ROOT}/.context/surface-harvest}"
RUN_DIR="${OUTPUT_ROOT}/run-${TIMESTAMP}"
mkdir -p "${OUTPUT_ROOT}"
mkdir -p "${RUN_DIR}/2560x1440/logs" "${RUN_DIR}/2560x1440/screenshots" "${RUN_DIR}/2560x1440/videos"
mkdir -p "${RUN_DIR}/1920x1080/logs" "${RUN_DIR}/1920x1080/screenshots" "${RUN_DIR}/1920x1080/videos"
mkdir -p "${RUN_DIR}/meta"
ln -sfn "run-${TIMESTAMP}" "${OUTPUT_ROOT}/latest"
: > "${RUN_DIR}/2560x1440/logs/session.jsonl"
: > "${RUN_DIR}/1920x1080/logs/session.jsonl"
```

Verify the app is reachable before opening a browser:

```bash
curl -sf "http://127.0.0.1:${PORT}/api/v1/state" | head -c 200
```

Do not use a `curl ... | python3 - <<'PY'` heredoc pattern for JSON parsing in preflight. It silently discards the piped body. Use `python3 -c`, `jq`, or feed Python a temp file instead.

For Risoluto:

- Read [prerequisites.md](./references/prerequisites.md) if setup or seed quality is uncertain.
- If `.env.seed` exists, source it and run `bash "${SKILL_DIR}/scripts/seed-test-data.sh" "${PORT}"`.
- Otherwise run `bash "${SKILL_DIR}/scripts/minimal-seed.sh" "${PORT}"`.
- Stop only when the app is genuinely unreachable or setup cannot be completed with the available credentials.

### 2. Build the inventory before testing deeply

Use [surface-seed.md](./references/surface-seed.md) as the starting model for Risoluto. For each route:

1. Generate a focused checklist when the seed is available.
2. Visit the route in headed desktop mode.
3. Snapshot interactive elements.
4. Expand every obvious child surface: tabs, drawers, dialogs, menus, dropdowns, row actions, filters, and settings subsections.
5. Add every revealed surface to the manifest immediately.

Helpful commands:

```bash
agent-browser --session shqa-2560 --headed open "http://localhost:${PORT}"
agent-browser --session shqa-2560 set viewport 2560 1440
agent-browser --session shqa-2560 wait --load networkidle
bash "${SKILL_DIR}/scripts/route-checklist.sh" "/queue" "${SKILL_DIR}/references/surface-seed.md"
agent-browser --session shqa-2560 snapshot -i
```

If a surface appears in the seed but not in the live app, mark it clearly as missing instead of silently dropping it. If you discover a new surface that is not in the seed, record it as discovered and continue testing it.

### 3. Run the deep route pass

Complete one route before moving to the next.

For each route:

1. Navigate and wait for real content, not a loading skeleton.
2. Capture the default screenshot.
3. Expand each child surface and capture evidence for it.
4. Apply the relevant interaction recipes from [interaction-taxonomy.md](./references/interaction-taxonomy.md).
5. Check console errors after every meaningful interaction.
6. Log every meaningful action with `log-action.sh`.
7. Update `surface-manifest.md` and `issues.md` before leaving the route.

Use this logging pattern after each meaningful action:

```bash
LOG="${RUN_DIR}/2560x1440/logs/session.jsonl"
bash "${SKILL_DIR}/scripts/log-action.sh" \
  "${LOG}" \
  "test" \
  "SURFACE-042" \
  "click @e7" \
  "success" \
  "0" \
  "screenshots/queue/SURFACE-042-default.png" \
  "opened sort control"
```

For Risoluto, cover the seed-defined surface types with the bundled recipes:

- `shortcut`: clear focus, press the shortcut, verify the URL or state change
- `sse-event`: inject the documented `CustomEvent` payload and verify the UI update
- `state-variation`: use `agent-browser network route` to force loading, empty, and error states
- `modal`: trigger, verify focus trap, verify escape or cancel paths, and handle native `confirm()` with a temporary override when necessary

When live polling or reseed timing keeps a valid surface out of reach, escalate in this order before leaving the row `BLOCKED`:

1. Route-local fetch mocks via `agent-browser network route`
2. Page-local `CustomEvent` injection for SSE-driven UI
3. A page-local browser harness that overrides only the route endpoints needed for the current proof
4. Browser-local runtime state forcing by importing the hashed client chunks that expose the live store, router, or API objects

For Risoluto, steps 3 and 4 are allowed when they stay inside the browser session, write all artifacts under the active run directory, and do not mutate the real backend state.

Use the harness/state-forcing path for surfaces like:

- running-only queue drawer sections that the poller keeps completing before you can inspect them
- retry-only sections that require a stable retrying issue
- overview or observability empty states that depend on a truly empty or null runtime snapshot
- SSE rerender paths that only become visible after the current store state changes

Before leaving a Risoluto route, run the checkpoint:

```bash
bash "${SKILL_DIR}/scripts/route-checkpoint.sh" \
  "/queue" \
  "${RUN_DIR}/surface-manifest.md" \
  "${SKILL_DIR}/references/surface-seed.md"
```

The checkpoint is a hard stop, not a suggestion. It now fails when seeded rows for the route are missing, when `BLOCKED` dominates the route, when `PASS+FAIL+FLAKY` proof is too low, or when `BLOCKED` rows do not mention a concrete escalation path.

### 4. Run deterministic route checks

On every meaningful route, verify more than visual rendering.

At minimum, check:

- console errors after interactions
- a visible `h1`
- route announcer updates after navigation
- duplicate IDs
- nested or invalid landmarks
- broken internal links when visible
- long-animation-frame or obvious main-thread blocking on heavy pages
- title behavior after repeated SPA navigation

Use `agent-browser eval` for these checks. If a page needs deeper network or performance debugging, open `chrome-devtools` as supporting evidence, not as the primary execution engine.

If `snapshot -i` disagrees with direct DOM inspection after synthetic state injection, treat the DOM and screenshots as authoritative for that experiment and note the reason in `session.jsonl`. Re-run screenshots and DOM assertions after every harness-driven rerender instead of trusting stale accessibility refs.

### 5. Run the secondary viewport pass when needed

For exhaustive desktop coverage, reopen the same route set at `1920x1080` and focus on layout regressions:

- horizontal overflow
- clipped tables
- sidebar collapse behavior
- modal fit
- dense controls wrapping badly
- text truncation or overlapping badges

This pass is for layout confidence, not for repeating every single adversarial interaction from the deep pass.

If you script the 1920 pass through a shell loop or batched browser command, wrap it with the strict gate so shell lookup failures cannot hide behind a successful exit:

```bash
bash "${SKILL_DIR}/scripts/strict-command-gate.sh" \
  "${RUN_DIR}/meta/1920-layout-pass.log" \
  -- \
  bash -lc '
    set -euo pipefail
    agent-browser --session shqa-1920 open "http://127.0.0.1:'"${PORT}"'"
    agent-browser --session shqa-1920 set viewport 1920 1080
    agent-browser --session shqa-1920 wait --load networkidle
  '
```

### 6. Write the reports and enforce artifact gates

Do not write the final coverage summary until the artifacts exist and the manifest is complete.

Use [output-format.md](./references/output-format.md) for the final structure. The minimum outputs are:

- `surface-manifest.md`
- `coverage-summary.md`
- `issues.md`
- `report.html`
- screenshots under the run directory
- session logs under the run directory

For Risoluto exhaustive runs, use the asset scaffold:

```bash
cp "${SKILL_DIR}/assets/surface-manifest-template.md" "${RUN_DIR}/surface-manifest.md"
```

Before you write `coverage-summary.md` or generate `report.html`, enforce the manifest-quality gate:

```bash
bash "${SKILL_DIR}/scripts/final-skip-gate.sh" \
  "${RUN_DIR}/surface-manifest.md" \
  "${SKILL_DIR}/references/surface-seed.md"
```

If the gate fails, keep testing. Promote every remaining `SKIP` into a real terminal outcome with evidence, or into `BLOCKED` with an explicit unblock path and escalation evidence.

Then prove the manifest still covers the full seed:

```bash
bash "${SKILL_DIR}/scripts/seed-coverage-gate.sh" \
  "${RUN_DIR}/surface-manifest.md" \
  "${SKILL_DIR}/references/surface-seed.md"
```

Then resync the summary from the final manifest instead of trusting stale hand-written counts:

```bash
python3 "${SKILL_DIR}/scripts/sync_coverage_summary.py" --run-dir "${RUN_DIR}"
```

Then generate the HTML report:

```bash
bash "${SKILL_DIR}/scripts/generate-report.sh" "${RUN_DIR}"
```

Then validate the retained artifacts before claiming success:

```bash
bash "${SKILL_DIR}/scripts/validate-run-artifacts.sh" \
  "${RUN_DIR}" \
  --seed-file "${SKILL_DIR}/references/surface-seed.md" \
  --require-viewport-log 2560x1440 \
  --require-viewport-log 1920x1080 \
  --require-page-screenshots 2560x1440 \
  --require-page-screenshots 1920x1080
```

Run those closeout commands one by one. Do not hide them inside one long shell chain where a broken intermediate result is easy to miss.

If validation fails, the run is not complete. Fix the broken command batch, restore the missing viewport evidence, or regenerate the report until the validator passes.

### 7. Resume honestly after interruption

If a run is interrupted:

1. Reuse the existing run directory.
2. Read the existing `session.jsonl`, manifest, and issues file.
3. Skip only surfaces that already have a terminal status.
4. Resume from the first untested or non-terminal surface.
5. Reuse any still-live browser harness session before rebuilding synthetic state from scratch.

## What Not To Do

- Do not collapse a whole route into one checkbox.
- Do not skip hidden UI such as row menus, drawers, confirmation dialogs, or settings subsections.
- Do not claim success because top-level pages loaded.
- Do not assign `PASS` to surfaces you did not individually visit.
- Do not stop at a loading spinner and call it covered.
- Do not silently ignore missing seed surfaces or newly discovered ones.
- Do not ask the user to prepare seed data when the bundled scripts or API routes can do it for you.
- Do not let a surface disappear from accounting. Every discovered or seeded surface needs a terminal status or an explicit non-terminal reason while the run is in progress.
- Do not treat a shell batch that printed `command not found` as usable evidence.
- Do not claim closeout if a required viewport log is empty.
- Do not bulk-convert `SKIP` into `BLOCKED` to satisfy closeout.
- Do not leave a seeded surface out of the manifest.
- Do not use boilerplate blocked reasons that omit the escalation you attempted.
- Do not accept a generated report that says there are zero routes or omits the per-route table.
