import fs from "node:fs/promises";

import { patchStatus } from "./state.ts";

async function main(): Promise<void> {
  const statusPath = process.argv[2];
  const patchArg = process.argv[3];
  if (!statusPath || !patchArg) {
    throw new Error("Usage: pnpm exec tsx update_status.ts <status-path> '<json-patch>'");
  }

  await fs.access(statusPath);
  const patch = JSON.parse(patchArg) as Record<string, unknown>;
  await patchStatus(statusPath, patch);
}

void main();
