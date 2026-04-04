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

Artifact path discipline:

- Prefer repo-relative paths under `.anvil/<slug>/`.
- Screenshots should normally point to `verification/screenshots/...`.
- Videos should normally point to `verification/videos/...`.
- Execution artifacts should normally point to `execution/...`.
- Review artifacts should normally point to `reviews/...`.

Each entry should explain what changed in the run state, not restate the entire phase.

Timestamp rule:

- Keep timestamps monotonic. A later phase entry must not start before the earlier phase entry completed unless you explicitly explain overlap.
