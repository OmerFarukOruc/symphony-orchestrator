const target = process.env.NIGHTLY_VALIDATION_MODE ?? "none";
const job = process.env.NIGHTLY_VALIDATION_JOB ?? "unknown";

if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch") {
  process.exit(0);
}

if (target === "none") {
  process.exit(0);
}

if (target !== job) {
  process.exit(0);
}

process.stderr.write(`[nightly-validation] intentionally failing ${job}\n`);
process.stderr.write(`[nightly-validation] marker=failure:${job}\n`);
process.exit(1);
