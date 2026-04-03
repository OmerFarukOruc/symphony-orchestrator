# Verification Routing

If UI changed:

- run `visual-verify`
- run `ui-test` for critical or regression-prone flows
- run Impeccable skills only when findings exist

If backend or API changed:

- run relevant tests
- run API, CLI, or manual-flow verification
- confirm any user-visible wiring if the backend should surface in the UI

If docs impact exists:

- compare updated docs against claims

If tests impact exists:

- confirm required tests were added, updated, or deleted
