import type { Request, Response } from "express";

import type { OrchestratorPort } from "../orchestrator/port.js";
import type { ModelUpdateBody } from "./request-schemas.js";

/**
 * Handles POST /:issue_identifier/model.
 *
 * Expects `validateBody(modelUpdateSchema)` middleware to have already
 * validated and attached the parsed body to `req.body`.
 */
export async function handleModelUpdate(
  orchestrator: OrchestratorPort,
  request: Request,
  response: Response,
): Promise<void> {
  const body = request.body as ModelUpdateBody;
  const reasoningEffort = body.reasoning_effort ?? body.reasoningEffort ?? null;

  const updated =
    typeof orchestrator.executeCommand === "function"
      ? await orchestrator.executeCommand({
          type: "update_issue_model_selection",
          identifier: String(request.params.issue_identifier),
          model: body.model,
          reasoningEffort,
        })
      : await orchestrator.updateIssueModelSelection({
          identifier: String(request.params.issue_identifier),
          model: body.model,
          reasoningEffort,
        });
  if (!updated) {
    response.status(404).json({
      error: {
        code: "not_found",
        message: "Unknown issue identifier",
      },
    });
    return;
  }
  response.status(202).json({
    updated: updated.updated,
    restarted: updated.restarted,
    applies_next_attempt: updated.appliesNextAttempt,
    selection: {
      model: updated.selection.model,
      reasoning_effort: updated.selection.reasoningEffort,
      source: updated.selection.source,
    },
  });
}
