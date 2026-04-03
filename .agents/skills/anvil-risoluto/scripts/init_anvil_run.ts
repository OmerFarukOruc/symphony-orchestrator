import fs from "node:fs/promises";
import path from "node:path";

import { writeStatus } from "./state.ts";

async function main(): Promise<void> {
  const root = process.cwd();
  const rawSlug = process.argv[2] ?? "example-anvil-run";
  // Reject path traversal characters in user-controlled slug.
  if (/[\\/]/.test(rawSlug) || rawSlug.includes("..")) {
    throw new TypeError(`invalid slug: must not contain path separators or dots: ${rawSlug}`);
  }
  const slug = rawSlug;
  const title = process.argv[3] ?? slug;
  const dryRun = process.argv.includes("--dry-run");
  const runDir = path.join(root, ".anvil", slug);
  const startedAt = new Date().toISOString();
  const nextRequiredAction = "Run preflight checks and write preflight.md before intake.";
  // Verify the resolved path stays within the .anvil directory.
  const resolvedRunDir = path.resolve(runDir);
  const anvilDir = path.resolve(root, ".anvil");
  if (!resolvedRunDir.startsWith(anvilDir + path.sep)) {
    throw new TypeError(`slug resolves outside the .anvil directory: ${resolvedRunDir}`);
  }

  await fs.mkdir(path.join(runDir, "reviews"), { recursive: true });
  await fs.mkdir(path.join(runDir, "execution"), { recursive: true });
  await fs.mkdir(path.join(runDir, "verification"), { recursive: true });

  const remainingPhases = [
    "intake",
    "brainstorm",
    "plan",
    "review",
    "audit",
    "finalize",
    "execute",
    "verify",
    "docs-tests-closeout",
    "final-push",
  ];
  const status = {
    slug,
    phase: "preflight",
    phase_status: "in_progress",
    active: true,
    review_round: 0,
    audit_round: 0,
    verify_cycle: 0,
    max_review_rounds: 3,
    max_audit_rounds: 2,
    max_verify_cycles: 3,
    pending_phases: remainingPhases,
    pending_gates: [],
    claim_counts: {
      total: 0,
      open: 0,
      passed: 0,
      failed: 0,
      accepted_risk: 0,
      not_applicable: 0,
    },
    docs_status: "pending",
    tests_status: "pending",
    push_status: "not_started",
    integration_branch: null,
    last_failure_reason: null,
    next_required_action: nextRequiredAction,
    dry_run: dryRun,
  };

  await fs.writeFile(path.join(root, ".anvil", "ACTIVE_RUN"), `${slug}\n`, "utf8");
  await writeStatus(path.join(runDir, "status.json"), status);
  await fs.writeFile(
    path.join(runDir, "pipeline.log"),
    `# Pipeline Log -- ${title}\n\n**Slug**: ${slug}\n**Started**: ${startedAt}\n**Status**: ${dryRun ? "DRY RUN STARTED" : "IN PROGRESS"}\n\n---\n\n## Phase 0: Preflight\n**Started**: ${startedAt}\n**Input**: ${title}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(runDir, "preflight.md"),
    [
      "# Preflight",
      "",
      "## Run State",
      `- Run: ${slug}`,
      "- Phase: preflight (in_progress)",
      "- Status: not run yet",
      "",
      "## Ready / Blocked Decision",
      "- Decision: pending",
      "",
      "## Next Action",
      `- ${nextRequiredAction}`,
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(runDir, "handoff.md"),
    [
      "# Handoff",
      "",
      "## Current State",
      `- Run: ${slug}`,
      "- Phase: preflight (in_progress)",
      "- Loop state: active",
      `- Next required action: ${nextRequiredAction}`,
      "",
      "## What Changed",
      "Initialized the anvil run scaffold and created the machine-readable state, directories, pipeline log, and preflight placeholder.",
      "",
      "## Open First",
      `1. \`.anvil/${slug}/status.json\` - machine-readable run state.`,
      `2. \`.anvil/${slug}/preflight.md\` - preflight readiness record.`,
      "",
      "## Evidence",
      `- Run scaffold created at ${startedAt}.`,
      `- Dry run: ${dryRun ? "yes" : "no"}.`,
      "",
      "## Open Risk",
      "- Preflight has not run yet, so the environment may still block the factory before intake begins.",
      "",
      "## Resume Here",
      `- ${nextRequiredAction}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

void main();
