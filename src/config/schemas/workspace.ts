/**
 * Zod schema for the workspace configuration subsection.
 */

import { z } from "zod";

const workspaceHooksSchema = z.object({
  afterCreate: z.string().nullable().default(null),
  beforeRun: z.string().nullable().default(null),
  afterRun: z.string().nullable().default(null),
  beforeRemove: z.string().nullable().default(null),
  timeoutMs: z
    .number()
    .default(60000)
    .transform((value) => (value > 0 ? value : 60000)),
});

const workspaceStrategySchema = z.enum(["directory", "worktree"]).catch("directory");

export const workspaceConfigSchema = z.object({
  root: z.string().default("../risoluto-workspaces"),
  hooks: workspaceHooksSchema.default(() => workspaceHooksSchema.parse({})),
  strategy: workspaceStrategySchema.default("directory"),
  branchPrefix: z.string().default("risoluto/"),
});
