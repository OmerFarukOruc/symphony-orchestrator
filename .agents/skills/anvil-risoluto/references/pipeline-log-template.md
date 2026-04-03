# Pipeline Log Template

Use an append-only markdown log.

Recommended structure:

- Feature title
- Started timestamp
- Current status
- Phase-by-phase entries with:
  - timestamp
  - action
  - artifact written
  - key outcome
  - blocker or next action
  - whether `handoff.md` and `closeout.md` were refreshed

Each entry should explain what changed in the run state, not restate the entire phase.

Timestamp rule:

- Keep timestamps monotonic. A later phase entry must not start before the earlier phase entry completed unless you explicitly explain overlap.
