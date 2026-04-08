import path from "node:path";

import { extractDocsPaths, loadRunContext, writeArtifact } from "./context.ts";

async function main(): Promise<void> {
  const runDir = process.argv[2];
  const outputPathArg = process.argv[3];
  if (!runDir) {
    throw new Error("Usage: pnpm exec tsx summarize_docs_impact.ts <run-dir> [output-path]");
  }

  const context = await loadRunContext(runDir);
  const outputPath = outputPathArg ? path.resolve(process.cwd(), outputPathArg) : path.join(context.runDir, "docs-impact.md");
  const docsPaths = extractDocsPaths(context.plan);
  const lines = [
    "# Docs Impact",
    "",
    `First-pass docs impact for \`${context.slug}\`. Move items from "Required" to "Updated" as implementation lands.`,
    "",
    "## Required Docs",
    docsPaths.length > 0 ? docsPaths.map((file) => `- [ ] ${file}`) : ["- [ ] No docs paths were extracted from the plan; confirm whether docs truly stay untouched."],
    "",
    "## Updated Docs",
    "- (none recorded yet)",
    "",
    "## Gaps",
    "- Confirm operator docs, setup docs, and any public-facing markdown stay truthful to the shipped behavior.",
  ];

  await writeArtifact(outputPath, `${lines.flat().join("\n")}\n`);
}

void main();
