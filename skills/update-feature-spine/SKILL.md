---
name: update-feature-spine
description: Explicit-invocation only. Updates `research/RISOLUTO_FEATURES.md` surgically after a merged PR on `main` and opens a spine PR in the private `research/` submodule. Does NOT auto-trigger on natural-language prompts — invoke via the `/update-feature-spine` slash command, by explicitly naming the skill ("use update-feature-spine for PR #400"), or from a Claude Code routine that passes a GitHub `pull_request.closed` + `merged: true` event payload.
allowed-tools: Bash, Read, Edit, Grep, Agent
---

# Update Feature Spine (per merged PR)

Surgical, incremental maintenance of Risoluto's canonical feature spine at
`research/RISOLUTO_FEATURES.md` (private submodule). Run once per merged PR on
`main`. Opens a spine PR in the `research/` submodule — **never** in the public
Risoluto repo, and **never** auto-merges.

The authoritative workflow lives at `.agents/prompts/update-feature-spine.md`.
Read it end-to-end before acting. This SKILL.md is a thin operator-facing
wrapper. Where this file **intentionally deviates** from the source prompt
(see § "Intentional deviations from the source prompt" below), this file wins.
For anything else, the source prompt wins.

## When to run

Run **only** when one of these is true:

1. The user invokes `/update-feature-spine` (optionally with a PR number or SHA).
2. The user explicitly names the skill: "use update-feature-spine for PR #400".
3. A Claude Code routine fires the skill with a GitHub `pull_request.closed`
   event where the payload indicates `merged: true` on `base.ref == main`.

Do **not** run on generic prompts like "update the docs", "did this PR change
behavior?", or "check the feature list". If in doubt, ask — do not auto-invoke.

## Inputs (in order of precedence)

1. Explicit PR number in the invocation (`#400`, `400`, `PR 400`).
2. Explicit merge-commit SHA.
3. **Routine mode — GitHub PR event payload** somewhere in context. Extract the
   PR number from whichever field the routine exposes (typically
   `pull_request.number` or `number` at the top level; `merge_commit_sha` and
   `base.ref` when present). If any of `merged == true`, `base.ref == "main"`,
   or a resolvable PR number is missing, exit silently with a one-line reason.
   Do not guess the shape — probe what's actually in context.
4. Fallback — most recent merged PR on `main`:

   ```bash
   gh pr list --repo OmerFarukOruc/risoluto --state merged --base main \
     --limit 1 --json number,title,mergedAt
   ```

Self-contained from here on — do not prompt the user mid-run. If a required
precondition fails, stop cleanly and report (see § Preconditions).

## Preconditions (stop if any fails)

- `research/` submodule exists at repo root and contains
  `RISOLUTO_FEATURES.md`. If missing → stop and tell the operator to run
  `.agents/prompts/build-feature-spine.md` first. **Do not attempt a rebuild
  from this skill.**
- `gh auth status` is authenticated.
- The target PR's diff is readable (private PRs may require access).
- Fresh submodule state — before any grep or classification, sync `research/`:

  ```bash
  git submodule update --init research
  git -C research fetch origin
  git -C research checkout main
  git -C research pull --ff-only origin main
  ```

  A stale local spine causes Phase 2 greps to miss entries that exist
  upstream, which silently misclassifies bucket ②/③/④ as ① (false new
  feature). Never skip this.

## The five buckets

Every PR falls into exactly one bucket. If a PR genuinely spans multiple
(e.g., adds a feature and refactors another module), process each bucket
independently in the same run.

| Bucket | Signals | Spine action |
|---|---|---|
| ① **New feature** | new route handler, new CLI flag, new config key, new public export, new UI page/component, `feat(X):` scope with src/ changes | Draft a NEW `###` entry under the matching bundle. Fill spine template. Mark header `⚠️ NEW — review required`. |
| ② **Behavior change** | src/ file modified; changed constants/limits/defaults/regex/string literals; `feat(X):` or `fix(X):` scope | Find entries citing the modified file via grep. Re-read impl. Update only the specific observable behaviors that changed. Update evidence line ranges. Append footnote. |
| ③ **Feature removed** | file deleted, route/export removed, revert PR | Find entry. Mark header `⚠️ Removed in <version> (PR #<N>)`. **Do NOT delete the entry** — past research comparisons reference it. |
| ④ **Pure refactor** | `refactor(X):` scope, same observable behaviors, code moved/renamed | Update evidence file paths + line ranges + class/function names only. No behavior edits. One-line footnote. |
| ⑤ **No spine impact** | no src/ or frontend/src/ changes; docs/test/CI/chore scope; formatting/lint fixes | Exit no-op. **No branch, no commit, no PR, no file edit.** Print the would-be run-history row in the terminal summary so routine logs capture the audit trail. |

**Ambiguous?** Default to ② and flag the footnote with
`⚠️ needs-review — possible behavior change, please verify`.

## Workflow (summary — see source prompt for full detail)

### Step 1 — Fetch & classify

```bash
gh pr view <N> --repo OmerFarukOruc/risoluto \
  --json number,title,body,mergedAt,mergeCommit,files,commits
```

Keep `src/**` and `frontend/src/**`; drop `tests/**`, `docs/**`, `.github/**`,
`package.json` (unless exposed deps changed), `pnpm-lock.yaml`, generated
files. Empty kept list → bucket ⑤ → skip to § "Terminal summary" and exit.

**Check for renames.** `gh pr view --json files` returns `previous_filename`
on renamed files. Build a map of `{new_path → previous_path}` so Phase 2 can
grep both. Missing this is the #1 cause of false-positive bucket ① calls.

### Step 2 — Locate affected entries

For each kept file, grep the spine for **both** the new path and, if it was
renamed, the previous path:

```bash
grep -n "Source:.*<new-path>" research/RISOLUTO_FEATURES.md
grep -n "Source:.*<previous-path>" research/RISOLUTO_FEATURES.md   # if renamed
```

- Matches found → bucket ②/③/④ candidates. A hit on the previous path means
  bucket ④ (pure refactor) at minimum; update evidence to the new path.
- No matches on either path, but src/ file meaningfully changed → candidate
  for bucket ① OR internal plumbing (no spine action). Read the code to
  decide — do not default to ① without reading.

### Step 3 — Apply updates per bucket

Use the templates in the source prompt § "Phase 3 — Apply updates per worklist
item". For large PRs (>50 changed files or any single file >800 lines) delegate
the read-and-summarize pass to an `Agent` call with `subagent_type: Explore`
so the main context stays lean; synthesis and edits stay here.

### Step 4 — Run history + summary

Prepend a row to `## Run history` at the top of the spine file:

```markdown
| 2026-04-19 | PR #<N> | <bucket> | <bundle> | <short summary> |
```

Create the table if missing (columns: `Date | PR | Bucket | Bundle | Summary`).
Refresh per-bundle counts in `## Summary` when entry count changes.

Bucket ⑤ skips this step — no file edit (see bucket table).

### Step 5 — Commit + open PR in the `research/` submodule

Before branching, make sure research-main is current and check for any open
spine PR that might conflict:

```bash
cd research
git fetch origin
git checkout main
git pull --ff-only origin main
gh pr list --state open --head-pattern 'spine/pr-*' \
  --json number,headRefName,title
```

If an open `spine/pr-*` PR already exists, proceed anyway but add a line to
your PR body: `Stacks on top of open spine PR(s): #<M>, ...`. Two concurrent
routine runs are rare but possible; stacking context lets the operator
merge-review in the right order instead of hitting an unexpected conflict.

Pick the commit message format based on what the research repo accepts:

```bash
if [ -f commitlint.config.cjs ] || [ -f commitlint.config.js ] || \
   [ -f .commitlintrc.json ] || [ -f .commitlintrc.yml ]; then
  COMMIT_PREFIX="chore(spine):"
else
  COMMIT_PREFIX="spine:"
fi
```

Default is the bare `spine:` prefix from the source prompt; fall back to
`chore(spine):` only when the research repo enforces conventional commits
and would reject the bare prefix.

```bash
git checkout -b spine/pr-<N>
git add RISOLUTO_FEATURES.md
git commit -m "$COMMIT_PREFIX update for PR #<N> — <bundle> (<bucket>)"
git push -u origin spine/pr-<N>
gh pr create --title "$COMMIT_PREFIX update for PR #<N> — <short summary>" \
  --body "..."   # body format in source prompt § Phase 5
```

**Never** open the spine PR in the public `OmerFarukOruc/risoluto` repo.
**Never** auto-merge the spine PR — the operator reviews and merges.

## Intentional deviations from the source prompt

The source prompt at `.agents/prompts/update-feature-spine.md` says bucket ⑤
should "Record a row in `## Run history`" **and** "No branch, no PR". Those
are mutually inconsistent — the spine file lives in a submodule, so any edit
needs a branch to land upstream. This skill resolves the contradiction by
dropping the file edit: bucket ⑤ emits the run-history line to the terminal
summary only. The routine's log captures the audit trail; the spine stays
clean of PR-churn-only noise.

Every other divergence is unintentional — file a bug.

## Anti-patterns — do not

- ❌ Rebuild or overwrite the spine from scratch — always surgical
- ❌ Delete removed-feature entries (use the ⚠️ Removed marker, keep the body)
- ❌ Overwrite existing footnotes — always append
- ❌ Invent new bundles — use the 11 from `docs/ROADMAP_AND_STATUS.md` verbatim
- ❌ Classify as ⑤ just to avoid reading code — if src/ changed, read it
- ❌ Auto-merge the spine PR
- ❌ Skip the ⚠️ NEW flag on new-feature entries
- ❌ Update evidence line ranges without opening the file — stale line numbers
  are a silent-failure hazard
- ❌ Open the spine PR in the public `OmerFarukOruc/risoluto` repo
- ❌ Grep only the new path on a renamed file — use `previous_filename`
- ❌ Skip the pre-flight submodule sync

## Self-check before opening the spine PR

- [ ] `research/` submodule was synced to `origin/main` before classification
- [ ] Renamed files were grepped against both new and previous paths
- [ ] Every `src/**` or `frontend/src/**` file in the PR diff is accounted for:
      matched an entry, spawned a new entry, or explicitly classified as
      internal plumbing (with justification in the PR body)
- [ ] Every updated entry has a new footnote with the PR number and date
- [ ] New-feature entries are flagged `⚠️ NEW — review required`
- [ ] Removed entries use the `⚠️ Removed` marker and retain their body
- [ ] `## Run history` row appended (or printed to terminal on bucket ⑤)
- [ ] `## Summary` counts refreshed if entry count changed
- [ ] Commit message uses the right prefix for the research repo's
      commitlint config
- [ ] If an open `spine/pr-*` PR already existed, the new PR body references it
- [ ] PR was opened in the `research/` submodule, not the public repo

## Terminal summary format (always print, including on bucket ⑤)

```
Spine update for PR #<N>:
  Bucket(s):       <list>
  Bundle(s):       <list>
  Entries updated: <n>
  Entries added:   <n>
  Entries removed: <n>
  Needs review:    <yes/no> — <reasons>
  Run-history row: <the line that was appended, or would have been for ⑤>
  Spine PR:        <url or "none — bucket ⑤ no-op">
```
