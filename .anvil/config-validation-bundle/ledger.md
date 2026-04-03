# Debate Ledger

## Settled

- **L1.** `WORKFLOW.md` remains a legacy import path only; strict validation work is scoped to raw-config ingress points instead of a workflow-first runtime. Settled in round 1.
- **L2.** #263 is implemented as explicit invalidation and consumer reload coverage on top of the existing cached `ServiceConfig` snapshot. Settled in round 1.
- **L3.** The provider registry stays honest to the current Codex runtime transport and does not imply a new dispatcher layer. Settled in round 1.
- **L4.** Git identity resolution applies to both host-side git commands and Docker worker startup. Settled in round 1.
- **L5.** The setup/API path for OpenAI keys must be reconciled with the docs and the new provider registry. Settled in round 1.
- **L6.** The plan explicitly distinguishes hot-reloadable consumers from restart-required config surfaces. Settled in round 1.

## Contested

*(none)*

## Open

*(none)*

## Score History

- Round 1: 7.8/10, CONDITIONAL GO, settled 6, contested 0, open 0
