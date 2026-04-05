---
description: Run the oh-my-anvil factory on one spec (intake → PR)
argument-hint: "<path-or-slug-or-issue-url> | init | resume <slug> | cancel <slug>"
---

You are invoking the oh-my-anvil skill to drive a single spec through the full
10-phase factory pipeline.

## Argument handling

Resolve `$ARGUMENTS` as follows:

1. **`init`** — Run the init wizard. Inspects the current project (package.json,
   playwright config, frontend dirs) and generates `anvil.config.yaml`. Prompts
   for confirmation before writing.

2. **`resume <slug>`** — Load `.anvil/runs/<slug>/status.json`, run the replay
   reconciliation script, clear `paused_sub`, set `active = true`, and re-enter
   the recorded phase.

3. **`cancel <slug>`** — Flip `spec.json.status` to `cancelled`, append a
   `run_complete` event with `outcome: cancelled`, leave the run dir in place.
   Do not delete the worktree.

4. **Path to `.anvil/specs/<slug>/`** — Load and validate the spec, proceed to
   phase 0 preflight.

5. **Slug string** — Resolve under `config.state.specs_dir`.

6. **Path to `spec.json` or `spec.md`** — Climb to the parent directory.

7. **GitHub issue URL** — `gh issue view` → synthesize a draft spec → force-run
   brainstorm to fill in the gaps.

8. **Anything else** — Vague intake. Scaffold a stub spec and force brainstorm.

## Invocation

After resolving the argument, invoke the `oh-my-anvil` skill with the resolved
spec directory. The skill owns the 10-phase pipeline from preflight through
final push.
