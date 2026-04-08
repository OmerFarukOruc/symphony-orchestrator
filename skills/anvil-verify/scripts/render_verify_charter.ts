import path from "node:path";

import {
  extractDocsPaths,
  extractSourcePaths,
  extractTestPaths,
  loadRunContext,
  renderIssueBullets,
  summarizeTouches,
  writeArtifact,
} from "./context.ts";

async function main(): Promise<void> {
  const runDir = process.argv[2];
  const outputPathArg = process.argv[3];
  if (!runDir) {
    throw new Error("Usage: pnpm exec tsx render_verify_charter.ts <run-dir> [output-path]");
  }

  const context = await loadRunContext(runDir);
  const outputPath = outputPathArg ? path.resolve(process.cwd(), outputPathArg) : path.join(context.runDir, "verify-charter.md");
  const sourcePaths = extractSourcePaths(context.plan);
  const docsPaths = extractDocsPaths(context.plan);
  const testPaths = extractTestPaths(context.plan);
  const touches = summarizeTouches(context.bundle);
  const issueBullets = renderIssueBullets(context.bundle);

  const questions = [
    "- What behavior must now work end to end?",
    "- What nearby surfaces are at regression risk because they share the same config, runtime, or UI boundary?",
    "- What docs statements must now be true after shipping?",
    "- What tests must now exist or change to prove the behavior?",
  ];
  if (touches.includes("ui")) {
    questions.splice(1, 0, "- What loading, empty, and error states must be seen in the UI?");
  }

  const proof = ["- Unit", "- Integration", "- Manual flow", "- Docs diff"];
  if (touches.includes("ui")) {
    proof.push("- Smoke", "- Visual");
  }

  const lines = [
    "# Verify Charter",
    "",
    `Auto-generated charter for \`${context.slug}\`. Refine the questions or proof routes if implementation details changed after planning.`,
    "",
    "## Focus Surfaces",
    sourcePaths.length > 0 ? sourcePaths.map((file) => `- ${file}`) : ["- (no source paths extracted from the plan yet)"],
    "",
    "## Docs Surfaces",
    docsPaths.length > 0 ? docsPaths.map((file) => `- ${file}`) : ["- (no docs paths extracted from the plan yet)"],
    "",
    "## Test Surfaces",
    testPaths.length > 0 ? testPaths.map((file) => `- ${file}`) : ["- (no test paths extracted from the plan yet)"],
    "",
    "## Operator Flows",
    issueBullets.length > 0 ? issueBullets : ["- Validate the user-visible flow described by the plan and requirements."],
    "",
    "## Questions",
    ...questions,
    "",
    "## Required Proof",
    ...proof,
  ];

  await writeArtifact(outputPath, `${lines.flat().join("\n")}\n`);
}

void main();
