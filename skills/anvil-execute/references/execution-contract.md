# Execution Contract

Use exactly one integration branch:

- `chore/batch-<slug>`

Rules:

- create isolated worktrees for worker units
- local worker commits only
- no worker pushes
- no worker PRs
- merge sequentially into the integration branch
- remove worktrees after merges
- run `simplify`
- run:
  - `pnpm run build`
  - `pnpm run lint`
  - `pnpm run format:check`
  - `pnpm test`

Conditionally run smoke, visual, and verification flows when the plan or diff requires them.
