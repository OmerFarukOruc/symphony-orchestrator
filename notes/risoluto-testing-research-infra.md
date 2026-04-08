# T4 Research: Real-data / nightly testing on self-hosted or VDS infrastructure

## Executive recommendation

For nightly real-data suites, the strongest default is **GitHub Actions as control plane, but with ephemeral self-hosted runners reserved only for trusted internal nightly jobs**, plus **containerized job execution**, **short-lived secrets via OIDC or an external secret broker**, **aggressive artifact capture**, and a **separate failure-postprocessor that deduplicates into Linear**. GitHub explicitly recommends ephemeral runners for autoscaling and warns that persistent self-hosted runners can be compromised or leak cross-job state; on self-hosted infrastructure, the main design goal is to recreate the “fresh VM per job” property as closely as possible.[1][2][16]

If you have only one or a few heavy nightly suites, the best cost/operability tradeoff is usually a **single powerful dedicated VDS/bare-metal runner host** that launches **one-shot JIT/ephemeral runners** and runs the suite inside a fresh container/workspace per run. If you need stronger isolation or multiple concurrent suites, move to **ephemeral VM runners with a small warm pool** or **ARC on Kubernetes**.[2][5][15]

---

## What matters most for this problem

1. **Trusted-scope only**: self-hosted runners should not execute untrusted PR code or broadly accessible workflows; GitHub warns self-hosted runners can be persistently compromised and are a poor fit for public/untrusted workflows.[1]
2. **Ephemerality over persistence**: use one-job runners (`--ephemeral` or JIT runners) and wipe the runtime after each run; GitHub does not recommend persistent runner autoscaling.[2][16]
3. **Short-lived credentials**: prefer OIDC to cloud/Vault-style secret brokers over long-lived static secrets; minimize `GITHUB_TOKEN` permissions.[1][15]
4. **Capture enough evidence to debug remotely**: runner logs, Playwright HTML report, JSON/JUnit summaries, traces, videos, and a compact run manifest should always survive the failed run.[2][6][7][8][9][10]
5. **Deduplicate failures before filing**: create one Linear issue per stable failure fingerprint, then update/comment on recurrence instead of opening a ticket every night.[11][12][14]

---

## Architecture options

| Option | Best for | Strengths | Weaknesses | Recommendation |
|---|---|---|---|---|
| **A. Single powerful dedicated VDS host + ephemeral runners + job containers** | One repo or a few heavy nightly suites; low concurrency; cost-sensitive teams | Lowest ops overhead; best performance per dollar; easy data locality; easy to give nightly suites a big machine; simple labels like `nightly`, `real-data`, `32cpu` | Single-host blast radius; weaker HA; you must be disciplined about cleanup, runner isolation, and host hardening | **Best default** for one main nightly real-data pipeline |
| **B. Ephemeral VM runners + small warm pool** | Multiple nightly jobs; desire for stronger host isolation without Kubernetes | Better job isolation; easier horizontal scale; can mix instance sizes; warm pool reduces queue delay materially | More automation; some idle cost; more moving parts; warm-pool sizing can overprovision | **Best next step** when one host becomes a bottleneck |
| **C. ARC runner scale sets on Kubernetes** | Platform teams; multiple repos/teams; existing K8s expertise | GitHub’s recommended Kubernetes autoscaling path; clean ephemeral pod lifecycle; centralized policy; scale sets and labels | Kubernetes tax; more networking/secrets/storage complexity; overkill for one nightly suite | **Best for multi-team platform** use, not first stop for one project |
| **D. Managed equivalent (for example CodeBuild-backed GH Actions runners)** | Teams that want the same GitHub workflow UX but less runner ops | Stronger managed boundaries; less custom autoscaling logic; good security/ops story | Less control; cloud/provider dependency; may not match VDS/on-prem requirements | Good fallback if self-hosted ops becomes a distraction |

### Recommended decision rule

- Choose **Option A** if you have:
  - one main nightly suite,
  - a trusted private repo,
  - limited need for concurrency,
  - and a desire to keep infra simple.
- Choose **Option B** if:
  - nightlies are long enough that queue time matters,
  - you want one-VM-per-job isolation,
  - or you need several concurrent heavy suites.
- Choose **Option C** only if:
  - you already operate Kubernetes comfortably,
  - and runners are becoming a shared internal platform.

---

## Recommended baseline design

### 1) Control plane

Use **GitHub Actions** only as the scheduler/orchestrator for:
- `schedule` nightlies,
- manual `workflow_dispatch` reruns,
- artifact publishing,
- and a final “failure processor” job.

Route nightly jobs to a **dedicated runner group** and **dedicated labels** such as:
- runner group: `nightly-realdata`
- labels: `self-hosted`, `linux`, `nightly`, `real-data`, `vds-32cpu`, `playwright`

Runner groups are a security boundary, and labels let you target larger machines or special environments.[3][4]

### 2) Execution plane

On self-hosted/VDS, use:
- **ephemeral or JIT self-hosted runners** for one job only,[1][2][16]
- a **fresh container or fresh VM image per run**,
- a **separate work directory / temp volume / namespace per run**,
- **no concurrent unrelated jobs on the same runner runtime**,
- **post-run wipe** of workspace, browser caches, temp dirs, and mounted secrets.

Playwright recommends fewer workers on CI for stability, but explicitly notes that **powerful self-hosted CI systems may use parallelism**, and broader throughput can come from **sharding across machines/jobs**.[7] That means a large dedicated machine is justified for nightly suites, but only if you keep the execution isolated.

### 3) Secret access

Use this order of preference:

1. **OIDC / short-lived cloud credentials** for storage, database snapshots, and secret manager access.[1][15]
2. **External secret manager** fetched at runtime with short TTLs.
3. **GitHub environment/repository secrets** only for values that cannot be federated.[1]

Do **not**:
- give broad permanent secrets to the runner host,
- store structured JSON blobs as a single secret if you can avoid it,[1]
- pass sensitive values as command-line arguments on shared/persistent runners, because GitHub notes another job can potentially inspect process args on reused infrastructure.[1]

### 4) Artifact and evidence plane

Persist these on every nightly run, especially failure paths:
- `playwright-report/` HTML report,[7][10]
- Playwright JSON report (`results.json`) for machine analysis,[10]
- optional JUnit XML if other tooling prefers it,[10]
- traces (`trace: 'on-first-retry'` or `retain-on-failure`),[8]
- videos (`video: 'on-first-retry'` or `retain-on-failure`),[9]
- raw console/test logs,
- runner application logs forwarded externally for ephemeral runners,[2]
- run manifest: commit SHA, branch, runner label, image digest, browser versions, environment name, dataset/snapshot ID, timestamps, shard index, retry count.

GitHub artifacts support configurable retention and digest validation; the artifact digest is automatically validated on download.[6]

### 5) Failure post-processing plane

After the test job finishes, run a separate processor job that:
- downloads artifacts,
- parses `results.json` / JUnit / summary files,
- computes stable fingerprints,
- applies noise filters,
- and creates or updates a Linear issue.

This decouples “collect evidence” from “decide whether to ticket.”

---

## Secrets handling best practices

### Use least privilege everywhere

GitHub’s security guidance is explicit:
- set the default `GITHUB_TOKEN` to minimal permissions and elevate per job only when required,[1]
- use secrets only for sensitive values,[1]
- mask generated sensitive values with `::add-mask::`,[1]
- rotate secrets and delete exposed logs if leakage occurs.[1]

### Practical pattern for nightly real-data tests

- Give the **runner host itself no standing data-plane privileges** beyond registering runners and fetching a short-lived bootstrap credential.
- Let the job exchange GitHub identity for a **time-scoped cloud/Vault token** using OIDC.[1][15]
- Use that short-lived token to fetch:
  - database credentials for a nightly readonly replica or snapshot,
  - object storage access,
  - any service API keys needed for test setup.
- Mount secrets into the test container as env vars or files that are deleted after the run.
- Keep “destructive” credentials separate from “read-only verification” credentials.

### When using protected environments

Environment secrets plus required reviewers are useful when a run needs especially sensitive credentials, but for fully automatic nightly jobs this is only practical if the environment remains auto-approvable. Otherwise, prefer a brokered runtime-secret model.[1]

---

## Cleanup and isolation strategy

### What GitHub’s warning implies in practice

GitHub says self-hosted runners do **not** provide the clean-VM guarantees of GitHub-hosted runners, and it recommends ephemeral runners for autoscaling.[1][2] It also warns that simply “destroying the runner after each job” is not enough if the underlying hardware is reused carelessly.[1]

### Strong isolation pattern on a single big VDS

If you want the simplicity of one powerful machine, use this pattern:

1. **Host**: hardened Linux VDS/bare-metal host, patched, minimal packages.
2. **Runner registration**: JIT or `--ephemeral` registration per job.[1][2]
3. **Execution wrapper**: each job launches in a fresh container/namespace with:
   - fresh workspace,
   - tmpfs or throwaway volume for test output,
   - no reuse of browser profile directories,
   - strict egress rules if possible.
4. **Data setup**: restore or mount a readonly snapshot / synthetic-real-data snapshot, not live mutable prod data.
5. **Teardown**:
   - upload artifacts,
   - flush runner logs externally,
   - destroy container/workspace/volume,
   - remove runner registration,
   - scrub temp credentials.

### When to choose stronger isolation than containers

Use per-job VMs rather than per-job containers when:
- the suite handles especially sensitive data,
- you need kernel-level isolation between jobs,
- you run heterogeneous jobs from different trust tiers,
- or you cannot confidently harden the shared host.

### Operational footnotes

If your VDS/firewall is restrictive, GitHub documents the domains needed for runner operation, artifact upload/download, and OIDC token retrieval.[2]

---

## Artifact capture and debugging best practices

### Playwright capture profile for nightly CI

A good nightly profile is:
- `trace: 'on-first-retry'` for normal nightlies, or `retain-on-failure` if retries are intentionally low,[8]
- `video: 'on-first-retry'` or `retain-on-failure`,[9]
- HTML + JSON reporters together,[10]
- `github` reporter only if you want GitHub annotations, but avoid overusing it with matrix-heavy runs because Playwright notes annotation noise can multiply.[10]

### What to upload

Upload as separate named artifacts:
- `playwright-report`
- `playwright-results-json`
- `playwright-junit` (optional)
- `playwright-traces`
- `playwright-videos`
- `runner-logs`
- `nightly-run-manifest`

Use custom retention for nightlies, typically:
- **14–30 days** on GitHub artifacts for normal runs,[6][7]
- longer retention in object storage for recurring failures or compliance-relevant evidence.

### How to make artifacts actionable

For every failed run, generate a compact summary JSON/Markdown containing:
- failing tests and count,
- top error classes/messages,
- links to trace/video/report/log artifacts,
- environment snapshot ID,
- first failed shard/browser,
- whether failure reproduced on retry,
- whether failure is new vs recurring.

This summary is what the ticketing processor should consume.

### Important limitation

GitHub artifact links are authenticated and retention-bound. For a ticket that may live longer than artifact retention, store either:
- a **durable evidence bundle** in object storage, or
- a compact permanent summary in the Linear issue body/comment,
- while keeping the full raw bundle in GitHub artifacts for the first 14–30 days.

---

## Cost / reliability tradeoffs

### Option A: single powerful machine

**Why it’s attractive**
- cheapest operationally,
- easiest to understand,
- best when the main cost is browser/test execution rather than orchestration,
- excellent for one long nightly suite that benefits from CPU/RAM locality.

**Reliability concerns**
- host outage = no nightlies,
- mis-cleanup can contaminate future runs,
- any host drift impacts all jobs.

**How to make it acceptable**
- immutable base image or configuration management,
- regular host patching,
- one-job ephemeral runner registration,
- run manifest including host/image version,
- canary self-test before the suite starts.

### Option B: warm pool of ephemeral VMs

AWS’s guidance is clear that ephemeral runners improve isolation and that warm pools can materially reduce startup delay; it cites roughly **70–80% wait-time reduction** for its warm-pool pattern.[15]

**Tradeoff**:
- better reliability/isolation,
- but more platform work and some idle cost.

### Option C: ARC scale sets

GitHub positions ARC as the **reference Kubernetes solution** for autoscaling self-hosted runners.[2][5]

**Tradeoff**:
- better standardization and shared platform value,
- but only worth it when you already have K8s/platform maturity.

### Spot/preemptible capacity

AWS notes Spot can reduce cost dramatically, up to 90% vs on-demand, but it is a bad fit for long, interruption-sensitive jobs unless you route those jobs to on-demand nodes with labels.[15]

### Recommended cost posture

- **PR/smoke tests**: GitHub-hosted or cheap managed runners.
- **Nightly real-data suites**: dedicated self-hosted/VDS runners.
- **Very expensive suites**: shard only the slowest stable partitions.
- **Warm pool**: only after queue delay becomes a real problem.

---

## Risk table

| Risk | Why it matters | Likelihood | Impact | Mitigation |
|---|---|---:|---:|---|
| Self-hosted runner compromise by untrusted code | GitHub warns self-hosted runners can be persistently compromised | Medium if scope is broad; Low if nightly-only | High | Restrict to trusted private workflows only; separate runner groups; no public/untrusted PR access; ephemeral/JIT runners[1][2][3] |
| Cross-run contamination | Old browser profiles, caches, workspaces, DB state can create false failures or hidden passes | Medium | High | Fresh container/VM/workspace each run; no persistent browser profiles; wipe temp volumes; readonly or resettable data snapshots[1][2] |
| Secret leakage in logs/process args | Secrets can appear in stdout/stderr or process listings | Medium | High | OIDC/short-lived creds; mask generated values; avoid secrets in CLI args; review logs; rotate on exposure[1][15] |
| Artifact blind spots | Failure cannot be triaged later, especially on ephemeral runners | Medium | High | Always upload reports/traces/videos/logs; forward runner logs externally; retain compact summaries durably[2][6][8][9][10] |
| Ticket noise / duplicate issues | Nightlies become ignored if every run opens a new Linear issue | High | High | Stable fingerprinting; recurrence thresholds; update existing issues via attachment URL lookup; one issue per fingerprint[11][12][14] |
| Startup latency on ephemeral infra | Nightly wall time increases; reruns become painful | Medium | Medium | Prebaked images; warm pool only if needed; dedicated large host for stable nightlies[2][15] |
| Host/image drift | Runner behavior changes independently of code changes | Medium | Medium | Immutable images; explicit versioned runner image; manifest capture; scheduled patch/update windows[2][5][15] |
| Single-host failure | One VDS outage misses the nightly | Medium for Option A | Medium/High | Backup runner host; manual rerun path; host health checks; consider Option B if failures become frequent |
| Artifact expiry breaks old tickets | Old Linear tickets lose evidence links | High over time | Medium | Put permanent summary in issue; upload durable evidence bundle for recurring failures; keep GitHub artifacts for short-term deep debug[6][10][12] |
| Overcomplex platform too early | Team spends more time on runner platform than on test quality | High if jumping to K8s too soon | Medium | Start with a single dedicated host; move to warm-pool VMs or ARC only when justified |

---

## Concrete failure-to-Linear design pattern

This is the most practical low-noise pattern from the sources.

### Goal

Create **one actionable Linear issue per real recurring nightly failure**, not one issue per failed run.

### Design

#### Step 1: Always collect evidence first

Nightly workflow:
1. run tests,
2. `if: always()` upload artifacts,[6][7]
3. emit a machine-readable `nightly-summary.json`,
4. run a final `process-nightly-failures` job.

#### Step 2: Build a stable failure fingerprint

Fingerprint on normalized fields such as:
- suite file / spec path,
- test title,
- normalized error class/message,
- top stable stack frame or assertion site,
- environment (`nightly-realdata`),
- browser/project only if it meaningfully changes triage.

Example pseudo-input:

```text
fingerprint_input = {
  spec: "checkout/payment.spec.ts",
  title: "saves payment method",
  errorClass: "TimeoutError",
  topFrame: "PaymentPage.saveCard",
  env: "nightly-realdata",
  browser: "chromium" // optional dimension
}
fingerprint = sha256(normalized_json(fingerprint_input))
```

Avoid including volatile data such as timestamps, random IDs, line numbers in generated bundles, or full URLs with run-specific query params.

#### Step 3: Apply a noise gate before ticketing

Only file or reopen when one of these is true:
- same fingerprint failed **2 consecutive nights**, or
- same fingerprint failed **2 of last 3 nights**, or
- failure affected a business-critical test list, or
- failure reproduced on retry.

If it fails only once and passes on retry, record it in a flaky dataset or comment-free metrics sink, not Linear.

#### Step 4: Use Linear attachments as the dedupe anchor

Linear attachments have two properties that are especially useful here:
- `attachmentsForURL(url)` lets you query by URL,[12]
- creating the same attachment URL on the same issue is idempotent and updates the attachment.[12]

So create a **stable external evidence URL per fingerprint**, for example:

```text
https://ci.example.com/nightly/failures/<fingerprint>
```

That URL does not need to be the raw artifact itself; it can be a durable landing page or a small summary object in object storage.

Then the postprocessor does:
1. query `attachmentsForURL(url: evidenceUrl)`[12]
2. if an open issue already exists for that URL/fingerprint:
   - add a comment with the latest recurrence,
   - update the attachment metadata,
   - optionally bump priority if recurrence count crosses a threshold.
3. otherwise:
   - create a new issue with `issueCreate`,
   - add the attachment with `attachmentCreate`.

#### Step 5: Keep the issue body short but complete

Recommended issue title:

```text
[Nightly][Real-data] checkout/payment.spec.ts :: saves payment method (fingerprint 9f31e9a8)
```

Recommended issue body template:

```md
## Failure summary
- First seen: 2026-04-07T02:14:00Z
- Last seen: 2026-04-08T02:16:12Z
- Recurrence: 2 / 2 nights
- Environment: nightly-realdata
- Browser/project: chromium
- Commit(s): abc1234, def5678
- Dataset/snapshot: snapshot-2026-04-08

## Error
TimeoutError in PaymentPage.saveCard

## Affected tests
- checkout/payment.spec.ts > saves payment method

## Evidence
- HTML report: <url>
- Trace: <url>
- Video: <url>
- Logs: <url>
- Run summary: <url>

## Triage notes
- Reproduced on retry: yes
- First failing shard: 2/6
- Suspected owner/system: payments
```

Keep raw logs out of the description except for a short excerpt; put bulky evidence in artifacts or durable object storage.

#### Step 6: Use attachment metadata for structured recurrence tracking

Linear attachment metadata supports arbitrary key/value fields and richer modal content.[12]

Good metadata fields:
- `fingerprint`
- `firstSeenAt`
- `lastSeenAt`
- `occurrenceCount`
- `latestRunId`
- `latestCommit`
- `env`
- `browser`
- `reportUrl`
- `traceUrl`
- `videoUrl`
- `logUrl`

This makes the attachment the canonical machine-readable state for the failure.

#### Step 7: Comment instead of reopening new issues

On recurrence, create a comment such as:

```md
Nightly recurrence detected.
- Run: 2026-04-08-nightly-1422
- Commit: def5678
- Snapshot: snapshot-2026-04-08
- Reproduced on retry: yes
- HTML report: <url>
- Trace: <url>
```

Use Linear’s comment creation/update capabilities through the GraphQL API / SDK.[11][14]

#### Step 8: Optional closeout automation

When the same fingerprint has been green for a chosen period, e.g. **3 consecutive nights**, optionally:
- comment that the failure has not recurred,
- move the issue to a resolved state with `issueUpdate`.[11]

This keeps the board clean without losing history.

---

## Example implementation sketch

### GitHub workflow shape

```yaml
name: nightly-real-data

on:
  schedule:
    - cron: "0 2 * * *"
  workflow_dispatch:

jobs:
  nightly-tests:
    runs-on: [self-hosted, linux, nightly, real-data, playwright]
    permissions:
      contents: read
      id-token: write
    steps:
      - checkout
      - fetch short-lived creds via OIDC
      - run tests in fresh container/workspace
      - write nightly-summary.json
      - upload HTML/JSON/JUnit/traces/videos/logs/manifest

  process-failures:
    needs: nightly-tests
    if: always()
    runs-on: ubuntu-latest
    steps:
      - download artifacts
      - parse nightly-summary.json and results.json
      - query Linear for existing fingerprint attachment
      - create/update issue + comment + attachment
```

### Why split processing onto GitHub-hosted infra

This reduces the chance that a broken self-hosted environment prevents ticket creation. It also keeps the Linear API token out of the heavy runner when possible.

### Linear API calls involved

- `issueCreate` to create a new ticket.[11]
- `issueUpdate` to change state/priority or reopen/resolve.[11]
- `attachmentCreate` to attach the stable evidence URL and metadata.[12]
- `attachmentsForURL` to find the existing issue from the stable fingerprint URL.[12]
- optional file upload if you want a compact file stored inside Linear, remembering upload must be proxied server-side.[13]

---

## Opinionated recommended setup

If the goal is a pragmatic, SaaS-grade nightly setup without overbuilding:

### Recommended now

- **GitHub Actions** for scheduling and orchestration.
- **One dedicated powerful Linux VDS** for nightly real-data execution.
- **Ephemeral/JIT self-hosted runners** only for the nightly runner group.[1][2][16]
- **Fresh containerized execution** per run on that host.
- **OIDC + external secret broker** for short-lived credentials.[1][15]
- **Playwright HTML + JSON reporters**, plus traces and videos on retry/failure.[8][9][10]
- **GitHub artifacts for 14–30 days**, plus durable summary URLs for recurring failures.[6]
- **A separate GitHub-hosted failure processor** that deduplicates into Linear using **attachment URL + fingerprint**.[11][12]

### Recommended later, if scale grows

- Move from one host to **warm-pool ephemeral VMs** if startup/throughput becomes painful.[15]
- Move to **ARC scale sets** only when runners become a shared internal platform.[5]

---

## Sources

1. **GitHub Docs — Security hardening for GitHub Actions**. Official guidance on self-hosted runner risks, secret handling, OIDC, token minimization, and why self-hosted runners should not be broadly exposed. https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
2. **GitHub Docs — Self-hosted runners reference / autoscaling**. Official guidance on runner routing, ephemeral runners, JIT runners, autoscaling, log forwarding, update policy, and communication requirements. https://docs.github.com/en/actions/reference/runners/self-hosted-runners and https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/autoscaling-with-self-hosted-runners
3. **GitHub Docs — Runner groups**. Official description of runner groups as an organization-level security boundary. https://docs.github.com/actions/concepts/runners/about-runner-groups
4. **GitHub Docs — Using labels with self-hosted runners**. Official guidance on targeting specialized runners via labels. https://docs.github.com/actions/hosting-your-own-runners/using-labels-with-self-hosted-runners
5. **GitHub Docs — Actions Runner Controller (ARC)**. Official guidance on the recommended Kubernetes-based autoscaling/self-hosted runner solution. https://docs.github.com/en/actions/concepts/runners/actions-runner-controller
6. **GitHub Docs — Store and share data with workflow artifacts**. Official artifact upload/download, retention, and digest validation guidance. https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow
7. **Playwright Docs — Continuous Integration**. Official CI guidance, including workers in CI, self-hosted parallelism, sharding, containers, and artifact upload examples. https://playwright.dev/docs/ci
8. **Playwright Docs — Trace viewer**. Official guidance for trace collection and viewing, especially `trace: 'on-first-retry'` and failure debugging. https://playwright.dev/docs/trace-viewer
9. **Playwright Docs — Videos**. Official guidance for video capture modes such as `on-first-retry` and `retain-on-failure`. https://playwright.dev/docs/videos
10. **Playwright Docs — Reporters**. Official guidance on HTML/JSON/JUnit/GitHub reporters and combining reporters. https://playwright.dev/docs/test-reporters
11. **Linear Developers — GraphQL getting started**. Official guidance on authentication, `issueCreate`, `issueUpdate`, and core GraphQL usage. https://linear.app/developers/graphql
12. **Linear Developers — Attachments**. Official guidance on idempotent attachment URLs, `attachmentsForURL`, attachment metadata, and attachment update behavior. https://linear.app/developers/attachments
13. **Linear Developers — How to upload a file to Linear**. Official guidance on file upload via `fileUpload`, including server-side proxy requirements. https://linear.app/developers/how-to-upload-a-file-to-linear
14. **Linear Developers — SDK fetching & modifying data**. Official SDK examples for creating and updating issues/comments and paging query results. https://linear.app/developers/sdk-fetching-and-modifying-data
15. **AWS DevOps Blog — Best practices working with self-hosted GitHub Action runners at scale on AWS**. High-signal engineering guidance on ephemeral runners, warm pools, short-lived creds, spot/on-demand tradeoffs, runner groups, and observability. https://aws.amazon.com/blogs/devops/best-practices-working-with-self-hosted-github-action-runners-at-scale-on-aws/
16. **GitHub Changelog — Ephemeral self-hosted runners & workflow_job webhook**. Official announcement clarifying the intent of single-job runners and webhook-driven autoscaling. https://github.blog/changelog/2021-09-20-github-actions-ephemeral-self-hosted-runners-new-webhooks-for-auto-scaling/
