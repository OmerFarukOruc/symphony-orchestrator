import express, { type Request, type Response } from "express";
import path from "node:path";

import { bearerAuth } from "./auth.js";
import type { AgentRunnerEventHandler } from "../agent-runner/contracts.js";
import { AgentRunner } from "../agent-runner/index.js";
import type { DispatchRequest, DispatchStreamMessage, PrecomputedRuntimeConfig, DataPlaneHealth } from "./types.js";
import { createTracker } from "../tracker/factory.js";
import { WorkspaceManager } from "../workspace/manager.js";
import { createGitHubToolProvider } from "../cli/runtime-providers.js";
import { PathRegistry } from "../workspace/path-registry.js";
import { createLogger } from "../core/logger.js";
import { toErrorString } from "../utils/type-guards.js";

const logger = createLogger().child({ component: "data-plane" });

/**
 * Create the data plane Express server.
 */
export function createDataPlaneServer(secret: string): express.Application {
  const app = express();
  const activeDispatches = new Map<string, AbortController>();

  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    const health: DataPlaneHealth = {
      status: "ok",
      activeDispatches: activeDispatches.size,
    };
    res.json(health);
  });

  app.post("/dispatch", bearerAuth(secret), async (req: Request, res: Response) => {
    try {
      const dispatchRequest = req.body as DispatchRequest;

      if (!dispatchRequest.issue || !dispatchRequest.config || !dispatchRequest.workspace) {
        res.status(400).json({ error: "missing required fields: issue, config, workspace" });
        return;
      }

      const {
        issue,
        attempt,
        modelSelection,
        promptTemplate,
        workspace,
        config,
        codexRuntimeConfigToml,
        codexRuntimeAuthJsonBase64,
      } = dispatchRequest;

      logger.info({ issueIdentifier: issue.identifier }, "Received dispatch request");

      const runId = issue.id;
      const abortController = new AbortController();
      activeDispatches.set(runId, abortController);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Transfer-Encoding", "chunked");
      res.flushHeaders();

      const sendSSE = (message: DispatchStreamMessage) => {
        res.write(`data: ${JSON.stringify(message)}\n\n`);
      };

      const onEvent: AgentRunnerEventHandler = (event) => {
        sendSSE({ type: "event", payload: event });
      };

      const { tracker, trackerToolProvider } = createTracker(() => config, logger);
      const workspaceManager = new WorkspaceManager(() => config, logger.child({ component: "workspace" }));
      const gitManager = createGitHubToolProvider(() => config, { env: process.env });
      const pathRegistry = PathRegistry.fromEnv();
      const archiveDir = path.join(process.env.DATA_DIR ?? "/data", "archives");

      const agentRunner = new AgentRunner({
        getConfig: () => config,
        tracker,
        trackerToolProvider,
        workspaceManager,
        archiveDir,
        pathRegistry,
        githubToolClient: gitManager,
        logger: logger.child({ component: "agent-runner" }),
      });

      // Pre-computed runtime config (avoids reading auth.json from disk)
      const precomputedRuntimeConfig: PrecomputedRuntimeConfig = {
        configToml: codexRuntimeConfigToml,
        authJsonBase64: codexRuntimeAuthJsonBase64,
      };

      try {
        const outcome = await agentRunner.runAttempt({
          issue,
          attempt,
          modelSelection,
          promptTemplate,
          workspace,
          signal: abortController.signal,
          onEvent,
          precomputedRuntimeConfig,
        });

        sendSSE({ type: "outcome", payload: outcome });
        logger.info({ issueIdentifier: issue.identifier, outcome: outcome.kind }, "Dispatch completed");
      } catch (error) {
        logger.error({ error: toErrorString(error), issueIdentifier: issue.identifier }, "Dispatch failed");
        sendSSE({
          type: "outcome",
          payload: {
            kind: "failed",
            errorCode: "dispatch_error",
            errorMessage: toErrorString(error),
            threadId: null,
            turnId: null,
            turnCount: 0,
          },
        });
      } finally {
        activeDispatches.delete(runId);
        res.end();
      }
    } catch (error) {
      logger.error({ error: toErrorString(error) }, "Dispatch handler error");
      if (!res.headersSent) {
        res.status(500).json({ error: "internal server error" });
      }
    }
  });

  app.post("/dispatch/:runId/abort", bearerAuth(secret), (req: Request, res: Response) => {
    const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;
    const abortController = activeDispatches.get(runId);

    if (!abortController) {
      res.status(404).json({ error: "run not found" });
      return;
    }

    abortController.abort();
    logger.info({ runId }, "Dispatch aborted");
    res.json({ status: "aborted" });
  });

  return app;
}
