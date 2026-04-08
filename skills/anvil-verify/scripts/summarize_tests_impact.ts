import path from "node:path";

import { extractTestPaths, loadRunContext, writeArtifact } from "./context.ts";

async function main(): Promise<void> {
  const runDir = process.argv[2];
  const outputPathArg = process.argv[3];
  if (!runDir) {
    throw new Error("Usage: pnpm exec tsx summarize_tests_impact.ts <run-dir> [output-path]");
  }

  const context = await loadRunContext(runDir);
  const outputPath = outputPathArg ? path.resolve(process.cwd(), outputPathArg) : path.join(context.runDir, "tests-impact.md");
  const testPaths = extractTestPaths(context.plan);
  const lines = [
    "# Tests Impact",
    "",
    `First-pass test impact for \`${context.slug}\`. Update this file as tests are added, renamed, or intentionally waived.`,
    "",
    "## Required Test Updates",
    testPaths.length > 0 ? testPaths.map((file) => `- [ ] ${file}`) : ["- [ ] No explicit test paths were extracted from the plan; confirm whether test coverage still needs expansion."],
    "",
    "## Updated Tests",
    "- (none recorded yet)",
    "",
    "## Gaps",
    "- Confirm every implementation unit has matching deterministic proof before the final push gate opens.",
  ];

  await writeArtifact(outputPath, `${lines.flat().join("\n")}\n`);
}

void main();
