# Symphony Desktop Scaffold

This directory is a lightweight placeholder for a future Tauri desktop shell.

## Scope

- Provide a host process that can start and stop the local Symphony service.
- Reuse Symphony's existing HTTP dashboard and API instead of duplicating logic.
- Keep packaging concerns isolated from the core orchestration modules in `src/`.

## Current Layout

- `src-tauri/`: Rust host scaffold and Tauri config placeholders.
- `web/`: placeholder directory for desktop-facing frontend glue.

## Integration Notes

The core service still starts via:

- `node dist/cli.js ./WORKFLOW.example.md --port 4000`

Future integration should wire desktop controls to this entrypoint and consume:

- `GET /api/v1/state`
- `POST /api/v1/refresh`
- other `/api/v1/*` endpoints already exposed by the service.
