# 🚀 Releasing Symphony

> Release preparation checklist for Symphony Orchestrator.

---

## ✅ Before Tagging

Confirm each of the following before creating a release tag:

- [ ] `package.json` version matches the intended release
- [ ] `README.md` describes the current shipped behavior
- [ ] `docs/OPERATOR_GUIDE.md`, `docs/ROADMAP_AND_STATUS.md`, `docs/CONFORMANCE_AUDIT.md`, `docs/TRUST_AND_AUTH.md`, `docs/OBSERVABILITY.md`, and `docs/RUNBOOKS.md` still match the implementation
- [ ] Workflow examples are safe to publish and contain **no secrets**
- [ ] `EXECPLAN.md` does not contain stale claims that contradict the codebase

---

## 🧪 Validation Steps

Run the following commands and confirm all pass:

```bash
# Unit tests
npm test

# Build
npm run build

# Desktop wrapper asset sanity
node --check desktop/web/app.js

# Dry-start (no credentials needed)
node dist/cli.js ./WORKFLOW.example.md
```

If you have real credentials available:

```bash
# Live integration (optional)
LINEAR_API_KEY=... npm run test:integration
```

If you have a Rust/Tauri toolchain available:

```bash
cargo check --manifest-path desktop/src-tauri/Cargo.toml
```

---

## 📦 Public Source Release Checklist

For a GitHub source release:

- [ ] Create or verify repository metadata, license, and visibility
- [ ] Ensure the default branch contains the validated release commit
- [ ] Create the tag in `vX.Y.Z` form
- [ ] Draft release notes from **verified repository facts only**
- [ ] Call out current scope clearly: local single-host orchestration is shipped; multi-host SSH distribution is **not**

---

## 📝 Suggested Release Notes Structure

| Section | Content |
|---------|---------|
| **Overview** | One-paragraph summary |
| **Key features** | Shipped capabilities |
| **API/Dashboard** | Operator-facing highlights |
| **Validation** | Steps performed |
| **Scope & limitations** | Known current scope |

---

## 🚫 Release Note Guardrails

> [!CAUTION]
> **Do not claim any of the following unless actually implemented:**
> - SSH or multi-host worker distribution
> - Package-manager distribution (if still source-only)
> - Behavior that only exists in planning notes but not in code
