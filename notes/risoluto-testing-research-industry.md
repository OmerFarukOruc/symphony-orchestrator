# SaaS-grade testing research for a TypeScript app like Risoluto

## Executive summary
For a SaaS-grade TypeScript system, the strongest current guidance is to split testing into a **fast PR lane** and a **deeper scheduled lane**. The PR lane should optimize for fast, actionable feedback using diff-aware/static checks, deterministic unit/component tests, contract smoke tests, accessibility smoke checks, and selective end-to-end coverage. The nightly lane should run the **full-system suite**: sharded Playwright across browsers/environments, full contract verification, security scans against a deployed target, load/performance thresholds, richer artifacts, and persistent failure reporting with ownership rather than noisy per-failure spam. [1][2][3][4][5][6][7][8][9][10][11][12][13][14][15][16][17]

The most consistent vendor guidance also points to three operational rules: **retain the right artifacts for the right duration**, **emit both machine-readable and human-readable failure outputs**, and **treat flaky or expensive signals differently from hard regressions**. In practice, that means short retention for shard intermediates, longer retention for merged reports and nightly evidence, annotations + JUnit/JSON/SARIF for automation, and grouped durable tickets only for repeated nightly failures or ownership-worthy issues. [1][2][3][6][9][10][12][13][16][17]

## Concise evidence table

| Topic | Key evidence | Implication for a SaaS-grade TypeScript app |
|---|---|---|
| Playwright CI stability | Playwright recommends `workers: 1` on CI for stability, recommends sharding for wider parallelization, and documents blob-report merge for combined reports. [1][4] | Keep individual CI workers conservative, then scale via shards/jobs rather than aggressive per-runner parallelism. |
| Playwright debugging artifacts | Playwright recommends `trace: 'on-first-retry'` for CI and supports HTML, JSON, JUnit, GitHub annotations, and blob reports. [2][3] | Default to lightweight runs on pass, but capture traces/report artifacts automatically on failures/retries. |
| Vitest reporting | Vitest supports multiple reporters, JUnit/JSON/HTML outputs, GitHub Actions annotations, and job summaries. [6] | Emit machine-readable outputs for CI plus concise terminal output for developers. |
| Vitest coverage/perf | Vitest recommends V8 coverage by default, supports include/exclude for uncovered files, and has profiling guidance for slow imports/transforms/coverage. [5][8] | Use coverage deliberately and profile slow suites instead of letting coverage bloat the PR lane. |
| Mutation testing | Stryker’s Vitest runner is designed for single-threaded test execution inside Stryker workers, bails early for performance, and supports TypeScript compile-error filtering plus dashboard reporting. [7] | Mutation testing is valuable but expensive; schedule it outside the main PR gate. |
| OpenAPI/schema testing | Schemathesis provides direct CI/CD guidance, GitHub Action usage, `--wait-for-schema`, and JUnit artifacts. [9] | Put schema-driven API testing in CI, especially nightly or against preview/staging deployments. |
| Consumer/provider contracts | Pact JS positions contract testing as a replacement for many brittle end-to-end integration checks and supports provider verification with broker publishing and pending/WIP pacts. [10][11] | Prefer contracts for service boundaries instead of relying only on full-stack end-to-end tests. |
| Accessibility automation | `@axe-core/playwright` and Deque Playwright guidance support automated accessibility scans in browser tests. [12][13] | Run a11y smoke checks in PRs and broader page coverage nightly. |
| Security in CI | GitHub recommends CodeQL default setup; Semgrep explicitly recommends diff-aware scans on PRs and regular full scans on the default branch at night/weekly; ZAP has GitHub Actions for baseline and API scanning. [14][15][16][17][18] | Use layered security lanes: PR diff-aware SAST, scheduled full SAST, and nightly/pre-release DAST against deployed environments. |
| Load/performance gating | k6 thresholds are first-class pass/fail criteria and exit non-zero on breach; Grafana documents GitHub Actions and scheduled nightly usage. [19][20] | Use small threshold-based perf smoke tests in CI and broader load tests nightly. |
| Artifact retention | GitHub artifacts default to 90 days; private repos can raise retention to 400 days; per-artifact `retention-days` is supported; `upload-artifact` v4+ artifacts are immutable and produce digest/URL outputs. [21][22][23] | Retention should be intentional and lane-specific, not one-size-fits-all. |
| Failure triage discipline | Playwright/Vitest support annotations and reports; Uber describes centralized flaky-test tracking with grouped ownership and durable tickets; ZAP can maintain/update a single issue over time. [3][6][16][17] | Immediate failures should surface inline in CI; persistent problems should roll up into owned tickets, not noisy one-off alerts. |

## Recommended lane partitioning (PR vs nightly)

### 1) PR lane: fast, deterministic, merge-blocking
Target outcome: **high-signal feedback in minutes**, not exhaustive coverage.

**Recommended contents**
- **Typecheck + lint + unit tests** via Vitest with concise output and JUnit/JSON artifacts only when useful. [5][6]
- **Selective browser/component tests** with Vitest Browser Mode or focused Playwright coverage for changed flows. Vitest explicitly supports separate `projects` for node vs browser tests. [6][8]
- **Playwright smoke E2E** only for core user journeys, with:
  - low worker counts on CI,
  - no full trace capture on pass,
  - `trace: 'on-first-retry'`,
  - JUnit/HTML/annotations where needed. [1][2][3]
- **Diff-aware security scanning** with Semgrep on pull requests. [15][18]
- **CodeQL default setup** for repository-level code scanning on PR/default branch if GitHub Advanced Security is available. [14]
- **OpenAPI/schema smoke tests** for changed APIs or critical endpoints using Schemathesis against a running preview/staging instance, producing JUnit. [9]
- **Accessibility smoke tests** using axe + Playwright on key pages only. [12][13]
- **Very small k6 perf smoke test** only if there is a stable preview target and strict runtime budget; otherwise reserve load tests for nightly. [19][20]

**What should block PRs**
- Deterministic unit/integration regressions
- Contract/schema breakage
- Critical security findings introduced by the change
- Key accessibility smoke regressions
- Core E2E smoke failures

**What should usually not block PRs**
- Full cross-browser E2E
- Broad DAST against deployed targets
- Large load/perf suites
- Mutation testing
- Exhaustive accessibility sweeps

### 2) Nightly lane: full-system, artifact-rich, ownership-driven
Target outcome: **broad confidence across the deployed system**.

**Recommended contents**
- **Full Playwright suite**, sharded across jobs/machines, with blob reports merged into a single HTML report. [1][3][4]
- **Cross-browser and environment coverage** where it matters most. [4]
- **Richer artifacts on failure**: traces, screenshots, merged HTML report, JUnit/JSON. [2][3]
- **Full API/schema testing** with Schemathesis against the deployed or staged system, not just mocked/local-only targets. [9]
- **Contract verification** for provider/consumer boundaries, including broker publishing when running in CI. [10][11]
- **Expanded accessibility coverage** across key routes/templates with axe. [12][13]
- **Security suite**:
  - full/default-branch Semgrep scans, which Semgrep explicitly recommends on a regular nightly/weekly cadence, [15]
  - CodeQL’s default scheduled analysis where enabled, [14]
  - ZAP baseline for web surfaces and ZAP API scan for OpenAPI/GraphQL targets on deployed/staging systems. [16][17]
- **Performance/load testing** with k6 thresholds that fail the run on SLO breach. [19][20]
- **Mutation testing** with Stryker on a rotation, changed packages, or critical modules. [7]

**Nightly should emphasize**
- merged artifacts,
- retention long enough for debugging trends,
- grouped failure reporting,
- durable ownership for repeated regressions,
- triage quality over immediate noise.

### 3) Optional weekly/deeper lane
If runtime/cost becomes a concern, move the heaviest items here:
- full mutation testing across broader scope,
- heavier k6 scenarios and multi-location runs,
- deeper ZAP/API DAST,
- full accessibility sweeps,
- extended browser matrices.

## Explicit recommendations

### A. Playwright
1. **Run Playwright conservatively on CI runners and scale via sharding.** Playwright explicitly recommends `workers: 1` on CI for stability, while providing first-class sharding and report merging. [1][4]
2. **Enable `trace: 'on-first-retry'` by default in CI.** This is the best cost/signal balance for failure diagnosis. [2]
3. **Use blob reports for shard jobs and merge them into one HTML report.** Retain raw shard reports briefly and merged reports longer. [3][4]
4. **Use annotations/JUnit for machine consumption and HTML for humans.** [3]
5. **Use preliminary changed-only runs only as a fast heuristic, never as the only gate.** Playwright’s docs explicitly say the full suite should still run afterward. [1]

### B. Vitest
6. **Keep PR Vitest runs lean.** Prefer fast V8 coverage, focused `coverage.include`, and multiple reporters only where they add value. [5][6]
7. **Use separate Vitest projects for node vs browser tests.** This cleanly partitions cheap logic tests from more expensive browser-style checks. [8]
8. **Turn on profiling before blaming Vitest for slowness.** The official docs point to import-duration logging, CPU/heap profiles, and coverage debug logs. [8]
9. **Use GitHub Actions reporter + JUnit/JSON where CI automation needs them.** [6]

### C. Mutation testing (Stryker)
10. **Run Stryker outside the PR critical path.** Official docs make its cost/perf tradeoffs clear: Stryker manages its own parallelism, forces single-threaded test execution inside each worker, and is meant for deliberate quality analysis rather than cheap gating. [7]
11. **Enable the TypeScript checker plugin** so invalid mutants are marked `CompileError` instead of wasting execution time. [7]
12. **Publish mutation results to the Stryker dashboard or long-lived artifacts** so teams can track trendlines rather than one-off scores. [7]

### D. OpenAPI and contract testing
13. **Use schema-driven API tests in CI with JUnit artifacts.** Schemathesis has the cleanest OpenAPI-first CI path and explicit GitHub Action guidance. [9]
14. **Use Pact where you have real consumer/provider boundaries.** Pact’s guidance is strongest for replacing brittle end-to-end integration checks with faster, clearer contracts. [10][11]
15. **Publish provider verification results from CI only.** Pact explicitly recommends that publication to the broker be CI-scoped. [11]
16. **Use pending/WIP pacts to avoid breaking provider builds on first publication.** [11]

### E. Accessibility
17. **Automate axe checks in both PR and nightly lanes, but with different scope.** PR: smoke coverage on critical flows. Nightly: broader route/template coverage. [12][13]
18. **Keep accessibility results attached to browser-test evidence.** The most actionable a11y failures are the ones paired with the exact page/test artifact that triggered them. [12][13]

### F. Security in CI
19. **Use layered security lanes rather than one monolithic scan.**
   - CodeQL default setup for repository-native code scanning. [14]
   - Semgrep diff-aware scans on PRs and full scans nightly/default branch. [15][18]
   - ZAP baseline/API scans against deployed or staged environments on a scheduled cadence. [16][17]
20. **Use SARIF/code-scanning style outputs where possible for developer workflows; reserve issue creation for persistent problems.** GitHub CodeQL is built for this; ZAP can maintain/update issues over time. [14][16]

### G. Performance/load
21. **Define pass/fail thresholds in k6, not just dashboards.** k6 explicitly treats threshold breaches as non-zero exits. [19]
22. **Keep PR perf tests tiny and nightly tests meaningful.** Small PR smoke thresholds catch gross regressions; nightly load tests should exercise realistic concurrency/duration. [19][20]
23. **If using Grafana Cloud k6, use PR comments sparingly and rely on threshold failures for gating.** The official action supports PR comments and scheduled workflows. [20]

### H. Artifact retention and failure reporting
24. **Use lane-specific artifact retention.** GitHub supports per-artifact `retention-days`, and org policy can range from 1–90 days for public and 1–400 days for private repos. [21][22][23]
25. **Recommended retention policy**
   - shard intermediates / raw blob reports: **1 day** [4]
   - merged HTML/JUnit/JSON reports for standard CI: **14–30 days** [1][4][21]
   - nightly security/perf evidence: **30–90 days** [21][22][23]
   - release or incident evidence in private repos: **90–180+ days** if policy/storage allow. [22]
26. **Exploit artifact immutability and output URLs.** `upload-artifact` v4+ makes artifacts immutable, returns artifact IDs/URLs/digests, and is a good fit for linking reports from summaries or tickets. [23]
27. **Always upload debugging artifacts on failure, and usually on `always()`/`!cancelled()` paths.** Playwright and Schemathesis examples both show artifact-centric workflows. [1][4][9]
28. **Use annotations for immediate feedback, durable tickets for persistent failures.** Playwright and Vitest support annotations; Uber’s approach is to group failures and assign durable ownership rather than ignore them. [3][6][17]
29. **For nightly failure reporting, group by owner/surface and deduplicate.** One durable ticket per failing area is better than one ticket per failed test. Uber’s design and ZAP’s issue-updating pattern both reinforce this. [16][17]

## Explicit anti-patterns

1. **Do not make the PR lane a clone of nightly.** This slows feedback, increases flake exposure, and usually reduces developer trust. [1][4][15][20]
2. **Do not rely on one giant end-to-end suite as your main integration strategy.** Use contract/schema testing to replace many brittle cross-service checks. [9][10][11]
3. **Do not capture full traces/screenshots for every passing Playwright test.** Playwright explicitly warns `trace: 'on'` is performance-heavy; prefer `on-first-retry` or `retain-on-failure`. [2]
4. **Do not over-parallelize within a single CI runner just to go faster.** Playwright recommends conservative workers on CI; scale with shards instead. [1][4]
5. **Do not gate every PR on mutation testing.** Stryker is better as a scheduled/deeper quality signal. [7]
6. **Do not run only diff-aware security scans forever.** Semgrep explicitly recommends regular full scans on the default branch, ideally nightly or weekly. [15]
7. **Do not run aggressive DAST blindly against every PR environment.** ZAP API scan is explicitly attack-oriented; use only on targets you are permitted to test and usually on scheduled/staged environments. [16][17]
8. **Do not keep all artifacts for the same duration.** Raw shard artifacts, merged reports, and release evidence have different value curves. [21][22][23]
9. **Do not upload multiple jobs into the same artifact name on `upload-artifact` v4+.** Artifacts are immutable and name collisions fail unless you explicitly overwrite/recreate. [23]
10. **Do not auto-ticket every transient flaky failure.** Ticket only repeated nightly failures or grouped persistent issues; otherwise use inline CI annotations/summaries. [3][6][17]
11. **Do not treat accessibility automation as “done” after one smoke page.** Keep the smoke set in PR, but broaden route/template coverage in nightly. [12][13]
12. **Do not let coverage scope drift unchecked.** Vitest’s docs explicitly recommend include/exclude tuning and profiling for slow coverage runs. [5][8]

## Practical baseline blueprint

### PR lane
- Vitest unit/integration
- Vitest browser/component tests for changed UI surfaces
- Playwright smoke E2E
- Schemathesis contract smoke
- axe smoke on critical pages
- Semgrep diff-aware
- CodeQL default setup if enabled
- artifacts: JUnit/JSON + failure traces/screenshots only
- retention: 7–14 days for normal CI, shorter for raw intermediates

### Nightly lane
- full Playwright sharded suite with merged HTML report
- broader axe coverage
- full Schemathesis against deployed/staging API
- Pact provider verification / broker publication in CI
- Semgrep full scan
- CodeQL scheduled/default-branch analysis
- ZAP baseline + API scan against allowed staged targets
- k6 threshold-based load test
- Stryker on rotated/high-value modules
- artifacts: merged reports, traces, JUnit/JSON/SARIF, k6 outputs
- retention: 30–90 days depending on storage and policy

### Persistent failure reporting
- inline PR feedback: annotations + job summaries + artifact links [3][6][23]
- nightly durable reporting: grouped owner ticket only after repeat or severity threshold [16][17]
- security findings: route via code scanning/SAST systems first; escalate repeated or high-severity findings to owned tickets [14][15][16]

## Numbered sources
1. **Playwright – Continuous Integration**: CI guidance, low-worker recommendation, artifact upload examples, changed-only preliminary runs. <https://playwright.dev/docs/ci>
2. **Playwright – Trace viewer**: recommends `trace: 'on-first-retry'` / `retain-on-failure`; explains trace artifacts. <https://playwright.dev/docs/trace-viewer>
3. **Playwright – Reporters**: HTML, blob, JSON, JUnit, GitHub annotations, attachment handling. <https://playwright.dev/docs/test-reporters>
4. **Playwright – Sharding**: shard balancing, blob-report merging, GitHub Actions examples, short retention for shard artifacts. <https://playwright.dev/docs/test-sharding>
5. **Vitest – Coverage**: V8 vs Istanbul guidance, include/exclude, custom coverage outputs, coverage performance notes. <https://vitest.dev/guide/coverage>
6. **Vitest – Reporters**: JUnit/JSON/HTML reporters, GitHub Actions annotations and job summary, blob reporter, reporter combinations. <https://vitest.dev/guide/reporters>
7. **StrykerJS – Vitest runner / TypeScript checker / Dashboard**: performance characteristics, TS mutant filtering, dashboard publication. <https://stryker-mutator.io/docs/stryker-js/vitest-runner/> ; <https://stryker-mutator.io/docs/stryker-js/typescript-checker/> ; <https://stryker-mutator.io/docs/General/dashboard/>
8. **Vitest – Browser Mode / Profiling Test Performance**: browser projects, Playwright provider, performance profiling/import duration guidance. <https://vitest.dev/guide/browser/> ; <https://vitest.dev/guide/profiling-test-performance>
9. **Schemathesis – CI/CD Integration Guide**: GitHub Actions, `--wait-for-schema`, JUnit reports, artifact upload. <https://schemathesis.readthedocs.io/en/stable/guides/cicd/>
10. **Pact JS – Overview**: why contract testing reduces brittle E2E integration tests; JS setup. <https://docs.pact.io/implementation_guides/javascript>
11. **Pact JS – Provider Verification**: provider verification, broker publication, pending/WIP pacts, CI publication guidance. <https://docs.pact.io/implementation_guides/javascript/docs/provider>
12. **Deque / axe – Playwright guidance**: Playwright accessibility setup. <https://docs.deque.com/developer-hub/2/en/dh-js-playwright/>
13. **`@axe-core/playwright` package docs**: chainable Playwright-based a11y analysis API. <https://www.npmjs.com/package/@axe-core/playwright>
14. **GitHub Docs – Configuring default setup for code scanning**: CodeQL default setup, PR/default-branch behavior, weekly schedule note. <https://docs.github.com/en/code-security/secure-coding/setting-up-code-scanning-for-a-repository>
15. **Semgrep – Add to CI/CD**: recommends full scans on default branch nightly/weekly and diff-aware scans for PRs. <https://semgrep.dev/docs/deployment/add-semgrep-to-ci>
16. **OWASP ZAP GitHub Action – Baseline scan**: issue maintenance, artifact reporting, safe baseline web scanning. <https://github.com/zaproxy/action-baseline>
17. **OWASP ZAP GitHub Action – API scan**: OpenAPI/GraphQL DAST against allowed API targets. <https://github.com/zaproxy/action-api-scan>
18. **Semgrep – Trigger diff-aware scans in GitHub Actions**: concrete PR diff-aware workflow. <https://semgrep.dev/docs/kb/semgrep-ci/trigger-diff-scans-env-var>
19. **Grafana k6 – Thresholds**: pass/fail criteria, exit-code behavior, threshold syntax, abort-on-fail. <https://grafana.com/docs/k6/latest/using-k6/thresholds/>
20. **Grafana Labs – Performance testing with k6 and GitHub Actions**: official GitHub Actions guidance, PR comments, scheduled nightly workflows. <https://grafana.com/blog/performance-testing-with-grafana-k6-and-github-actions/>
21. **GitHub Docs – Store and share data with workflow artifacts**: per-artifact retention, artifact usage, validation/digest. <https://docs.github.com/en/actions/advanced-guides/storing-workflow-data-as-artifacts>
22. **GitHub Docs – Configuring the retention period for artifacts and logs**: default 90 days; public 1–90 days, private 1–400 days. <https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization>
23. **`actions/upload-artifact` README**: immutability, retention-days, artifact URL/digest outputs, overwrite semantics, name-collision limits. <https://raw.githubusercontent.com/actions/upload-artifact/main/README.md>
24. **GitHub Docs – Choosing when your workflow runs**: official guidance for scheduled/nightly workflows. <https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs>
25. **Semaphore blog – How to Stop the Flakes Before They Fly**: high-signal engineering guidance on flake causes and prevention. <https://semaphore.io/blog/stop-flaky-tests>
26. **Uber Engineering – Flaky Tests Overhaul at Uber**: centralized flaky-test tracking, grouped ownership, durable ticketing, CI impact lessons. <https://www.uber.com/blog/flaky-tests-overhaul/>
