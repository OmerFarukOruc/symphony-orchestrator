# Verification findings for `outputs/risoluto-testing-brief.md`

## Summary
- **FATAL:** 0
- **MAJOR:** 3
- **MINOR:** 2

This pass checked the brief against:
- `notes/risoluto-testing-research-repo.md`
- `notes/risoluto-testing-research-industry.md`
- `notes/risoluto-testing-research-literature.md`
- `notes/risoluto-testing-research-infra.md`
- spot verification of cited repo artifacts where the brief made direct repository claims

No fatal contradictions were found. The main problems are **one factual count mismatch** and **several places where the brief states conditional or single-source recommendations too confidently**.

---

## Findings

### [MAJOR] Executive summary overstates the certainty of the E2E-vs-lower-layer evidence
- **Claim in brief:** The executive summary says UI/E2E-focused evidence “**consistently shows broader tests are more brittle and expensive to maintain than narrower ones**.”
- **Why this is a problem:** `notes/risoluto-testing-research-literature.md` does support that UI/E2E-style tests are especially brittle and costly to maintain, but it also explicitly says **direct modern E2E-vs-integration evidence is surprisingly sparse** and that several conclusions are **synthesized indirectly**, not from a decisive head-to-head comparison.
- **Evidence:**
  - `notes/risoluto-testing-research-literature.md` — executive summary and sections on UI/E2E brittleness and E2E vs integration tradeoffs
  - especially the caveat that “the direct E2E vs integration evidence base is weaker than practitioner discussions imply”
- **Concrete fix recommendation:** Soften the sentence to preserve the caveat. Example:
  - “UI/E2E-focused evidence and industry guidance indicate that broader tests are usually more brittle and expensive to maintain than narrower ones, although direct modern E2E-vs-integration comparisons remain limited.”

### [MAJOR] The dedicated VDS/self-hosted nightly recommendation is presented too categorically
- **Claim in brief:** The brief frames a “**best Risoluto-specific strategy**” / “**strongest default**” as a dedicated VDS/self-hosted nightly lane.
- **Why this is a problem:** `notes/risoluto-testing-research-infra.md` supports this architecture as a strong default **only under stated conditions**: one or a few heavy nightly suites, modest concurrency, and cost-sensitive operation. The note also presents **ephemeral VM runners** and **ARC on Kubernetes** as better fits when scale or isolation needs increase. The brief drops most of that conditional framing.
- **Evidence:**
  - `notes/risoluto-testing-research-infra.md` — opening recommendation and option table
  - the VDS option is framed as best default for **one main nightly real-data pipeline**, not as a universal best architecture
- **Concrete fix recommendation:** Reframe this as a conditional fit, not a blanket conclusion. Example:
  - “If Risoluto expects one main nightly real-data pipeline with modest concurrency, a dedicated VDS/self-hosted runner is the simplest default; if concurrency or isolation needs grow, move toward ephemeral VM runners or ARC.”

### [MAJOR] Failure-to-Linear ticket thresholds are single-source heuristics presented as settled policy
- **Claim in brief:** The brief says to open/reopen a Linear issue only when the same fingerprint fails on “**2 consecutive nights**,” “**2 of the last 3 nights**,” etc.
- **Why this is a problem:** Those thresholds appear in `notes/risoluto-testing-research-infra.md` as part of a proposed design pattern. They are **not corroborated by the repo note, industry note, or literature note**, and the brief currently presents them as if they are evidence-backed defaults rather than tunable heuristics.
- **Evidence:**
  - `notes/risoluto-testing-research-infra.md` — failure deduplication design section
- **Concrete fix recommendation:** Label these as **initial heuristics** or **proposed defaults** and explicitly say they should be tuned after observing actual flake rates and incident frequency.

### [MINOR] Frontend test count is off by one
- **Claim in brief:** Section 1.1 says there are “**29 frontend unit test files** under `tests/frontend/`.”
- **Why this is a problem:** `notes/risoluto-testing-research-repo.md` records **28** frontend test files, and spot-checking `tests/frontend/` shows **28 `*.test.ts` files plus one helper file** (`helpers.ts`). The brief appears to have counted the helper as a test file.
- **Evidence:**
  - `notes/risoluto-testing-research-repo.md` — `tests/frontend/*.test.ts`: **28 files**
  - `tests/frontend/` directory listing includes one non-test helper file
- **Concrete fix recommendation:** Change the claim to either:
  - “**28 frontend unit test files**”, or
  - “29 files under `tests/frontend/`, including 28 test files and one helper.”

### [MINOR] Risk ranking language is slightly stronger than the repo note supports
- **Claim in brief:** Section 2.1 says these low-covered files are “**some of the paths most likely to hurt operators in production**.”
- **Why this is a problem:** The repo research note supports the weaker claim that these are **important operational paths** and that some operationally critical areas are under-protected. It does **not** establish a ranked “most likely” ordering.
- **Evidence:**
  - `notes/risoluto-testing-research-repo.md` — low-coverage operational paths and caveats about the checked-in coverage artifact being incomplete
- **Concrete fix recommendation:** Replace with less absolute wording such as:
  - “some important operational paths remain under-protected relative to their risk”
  - or “some plausibly high-risk operator-facing paths remain under-protected”

---

## Checked claims that appear supported
These did **not** raise verification issues in this pass:
- the repo has a broad multi-layered test inventory
- frontend Vitest exists but is not part of the default pre-push or PR gate
- full-stack Playwright, visual regression, and live-provider suites are nightly/manual rather than normal PR gate
- skipped/scaffolded integration suites exist for PR status and checkpoints
- the repo currently has Linear issue creation support but no attachment-based deduplication implementation
- the nightly/mutation workflows currently notify Slack on failure

---

## Recommended disposition
The brief is directionally solid, but before it is treated as a final decision document, it should be revised to:
1. fix the frontend test count,
2. restore the literature caveat on direct E2E-vs-integration evidence,
3. make the dedicated-VDS architecture recommendation conditional rather than universal,
4. relabel the Linear ticket thresholds as proposed heuristics rather than settled policy.
