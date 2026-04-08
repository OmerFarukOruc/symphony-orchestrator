import path from "node:path";

import { loadRunContext, renderIssueBullets, summarizeTouches, writeArtifact } from "./context.ts";

async function main(): Promise<void> {
  const runDir = process.argv[2];
  const outputPathArg = process.argv[3];
  if (!runDir) {
    throw new Error("Usage: pnpm exec tsx render_claims.ts <run-dir> [output-path]");
  }

  const context = await loadRunContext(runDir);
  const outputPath = outputPathArg ? path.resolve(process.cwd(), outputPathArg) : path.join(context.runDir, "claims.md");
  const issueClaims = renderIssueBullets(context.bundle).map((line, index) =>
    line.replace(/^- /, `- [pending] CLM-ISSUE-${String(index + 1).padStart(3, "0")}: `)
  );
  const touches = summarizeTouches(context.bundle);

  const sections: string[] = [
    "# Claims",
    "",
    `Auto-generated verification register for \`${context.slug}\`. Update claim statuses as evidence comes in. Allowed statuses are \`pending\`, \`passed\`, \`failed\`, \`reopened\`, \`accepted-risk\`, and \`n/a\`.`,
    "",
    "## Core",
    `- [pending] CLM-CORE-001: The implementation matches the approved \`.anvil/${context.slug}/plan.md\` scope and does not ship unresolved ledger items.`,
    "- [pending] CLM-CORE-002: All required quality gates pass on the final integration branch before the single push.",
  ];

  if (issueClaims.length > 0) {
    sections.push("", "## Bundle Source Items", ...issueClaims);
  }

  if (touches.includes("backend")) {
    sections.push("", "## Backend", "- [pending] CLM-BE-001: Backend and runtime behavior reflect the changed plan surfaces without silent config drift.");
  }
  if (touches.includes("ui")) {
    sections.push("", "## UI", "- [pending] CLM-UI-001: UI flows, loading states, and error states still behave correctly after the change.");
  }
  if (touches.includes("docs")) {
    sections.push("", "## Docs", "- [pending] CLM-DOC-001: Operator-facing docs describe the shipped behavior accurately and remove stale guidance.");
  }
  if (touches.includes("tests")) {
    sections.push("", "## Tests", "- [pending] CLM-TEST-001: Required tests were added or updated for each touched surface and fail before the fix when appropriate.");
  }

  await writeArtifact(outputPath, `${sections.join("\n")}\n`);
}

void main();
