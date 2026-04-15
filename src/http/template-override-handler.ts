import type { Request, Response } from "express";

import type { OrchestratorPort } from "../orchestrator/port.js";
import type { TemplateStorePort } from "../prompt/port.js";
import type { TemplateOverrideBody } from "./request-schemas.js";
import { issueNotFound } from "./route-helpers.js";

/**
 * Handles POST /:issue_identifier/template.
 *
 * Expects `validateBody(templateOverrideSchema)` middleware to have already
 * validated and attached the parsed body to `req.body`.
 *
 * Returns 202 on success, 404 if the identifier or template is unknown.
 */
export async function handleTemplateOverride(
  orchestrator: OrchestratorPort,
  templateStore: TemplateStorePort,
  request: Request,
  response: Response,
): Promise<void> {
  const body = request.body as TemplateOverrideBody;
  const identifier = String(request.params.issue_identifier);
  const templateId = body.template_id;

  const template = templateStore.get(templateId);
  if (!template) {
    response.status(404).json({
      error: {
        code: "template_not_found",
        message: `template "${templateId}" not found`,
      },
    });
    return;
  }

  const updated =
    typeof orchestrator.executeCommand === "function"
      ? await orchestrator.executeCommand({
          type: "set_issue_template_override",
          identifier,
          templateId,
        })
      : orchestrator.updateIssueTemplateOverride(identifier, templateId)
        ? { updated: true, appliesNextAttempt: true }
        : null;
  if (!updated) {
    issueNotFound(response);
    return;
  }

  response.status(202).json({
    updated: true,
    applies_next_attempt: true,
  });
}

/**
 * Handles DELETE /:issue_identifier/template.
 *
 * Returns 200 on success, 404 if the identifier is unknown.
 */
export async function handleTemplateClear(
  orchestrator: OrchestratorPort,
  request: Request,
  response: Response,
): Promise<void> {
  const identifier = String(request.params.issue_identifier);

  const cleared =
    typeof orchestrator.executeCommand === "function"
      ? await orchestrator.executeCommand({
          type: "clear_issue_template_override",
          identifier,
        })
      : orchestrator.clearIssueTemplateOverride(identifier)
        ? { cleared: true }
        : null;
  if (!cleared) {
    issueNotFound(response);
    return;
  }

  response.status(200).json(cleared);
}
