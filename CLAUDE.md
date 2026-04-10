@AGENTS.md

## Claude Code

### agent-ci

- `npx @redwoodjs/agent-ci run --quiet --workflow .github/workflows/ci.yml` — run CI locally
- On step failure: `npx @redwoodjs/agent-ci retry --name <runner>` after fixing
- Do NOT push to trigger remote CI — use agent-ci locally instead
- CI was green before you started; any failure is caused by your changes
