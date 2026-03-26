import type { Request, Response } from "express";

import { hasCodexAuthFile, hasLinearCredentials, hasRepoRoutes } from "../setup-status.js";
import type { SetupApiDeps } from "./shared.js";

export function handleGetStatus(deps: SetupApiDeps) {
  return (_req: Request, res: Response) => {
    const masterKeyDone = deps.secretsStore.isInitialized();
    const linearProjectDone = hasLinearCredentials(deps.secretsStore);
    const hasApiKey = !!(deps.secretsStore.get("OPENAI_API_KEY") || process.env.OPENAI_API_KEY);
    const hasAuthJson = hasCodexAuthFile(deps.archiveDir, deps.configOverlayStore.toMap());
    const openaiKeyDone = hasApiKey || hasAuthJson;
    const githubTokenDone = !!(deps.secretsStore.get("GITHUB_TOKEN") || process.env.GITHUB_TOKEN);

    res.json({
      configured: masterKeyDone && linearProjectDone,
      steps: {
        masterKey: { done: masterKeyDone },
        linearProject: { done: linearProjectDone },
        repoRoute: { done: hasRepoRoutes(deps.configOverlayStore.toMap()) },
        openaiKey: { done: openaiKeyDone },
        githubToken: { done: githubTokenDone },
      },
    });
  };
}
