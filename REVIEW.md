# Risoluto Review Patterns

Learned patterns from Devin review loops. Devin uses this file for project-aware
review context. Add rules only for recurring patterns that caused real bugs.

## Learned Patterns

### Host allowlist: never use `includes()` for security-sensitive host matching

Any function that validates a hostname for an allowlist (GitHub, Linear, Slack, etc.)
must not use `host.includes(".domain.")`. A substring check matches attacker-controlled
domains like `evil.github.attacker.com`. Use exact equality (`===`), `endsWith()` with
a full suffix including the leading dot (`.github.com`), or `startsWith()` with a
verified prefix. Each check must be independently sufficient.

```ts
// WRONG — matches evil.github.attacker.com
host.includes(".github.")

// CORRECT — only matches legitimate GHE patterns
host === "github.com" || host === "api.github.com" || host.endsWith(".github.com")
```

### CI release detection: use `git tag --points-at HEAD`, not `package.json` version

Do not detect whether a CI release job published a new version by reading
`package.json` and checking if a matching git tag exists. After the first release
(e.g., `v1.0.0`), non-release pushes (`chore`, `docs`) still have `version=1.0.0`
in `package.json` and the `v1.0.0` tag already exists — so the check false-positives
and downstream jobs (docker-push, deploy) run unnecessarily.

```yaml
# WRONG — false-positives on non-release pushes
VERSION=$(node -p "require('./package.json').version")
if git tag --list "v${VERSION}" | grep -q .; then

# CORRECT — only true when semantic-release tagged the current commit
if git tag --points-at HEAD | grep -q '^v'; then
  VERSION=$(node -p "require('./package.json').version")
```

### Commitlint scope enum must include all automated commit scopes

Any tool that creates commits (semantic-release, bots, scripts, CI jobs) must have
its commit scope listed in `commitlint.config.ts` scope-enum. If not, the `.husky/
commit-msg` hook rejects the commit when cherry-picked or amended locally. For
semantic-release, add `"release"` since it creates `chore(release): vX.Y.Z [skip ci]`.
