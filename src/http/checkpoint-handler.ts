import type { Request, Response } from "express";

import type { AttemptStorePort } from "../core/attempt-store-port.js";
import type { OrchestratorPort } from "../orchestrator/port.js";

type CheckpointHandlerDeps = {
  orchestrator: OrchestratorPort;
  attemptStore?: Pick<AttemptStorePort, "listCheckpoints">;
};

export async function handleAttemptCheckpoints(
  deps: CheckpointHandlerDeps,
  request: Request,
  response: Response,
): Promise<void> {
  if (!deps.attemptStore) {
    response.status(503).json({ error: { code: "not_configured", message: "attempt store not available" } });
    return;
  }
  const attemptId = String(request.params.attempt_id);
  const attempt = deps.orchestrator.getAttemptDetail(attemptId);
  if (!attempt) {
    response.status(404).json({ error: { code: "not_found", message: "Unknown attempt identifier" } });
    return;
  }
  const checkpoints = await deps.attemptStore.listCheckpoints(attemptId);
  response.json({ checkpoints });
}
