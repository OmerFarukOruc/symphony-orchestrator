import type { Request, Response } from "express";

import { buildCreateLabelMutation } from "../../linear/queries.js";
import { getErrorMessage } from "../../utils/type-guards.js";
import { readProjectSlug } from "../setup-status.js";
import {
  callLinearGraphQL,
  getLinearApiKey,
  lookupProject,
  type LinearGraphQLResponse,
  type SetupApiDeps,
} from "./shared.js";

async function createSymphonyLabel(
  apiKey: string,
  projectSlug: string,
): Promise<{ id: string; name: string; alreadyExists: boolean }> {
  const project = await lookupProject(apiKey, projectSlug);
  const teamId = project.teams?.nodes?.[0]?.id;
  if (!teamId) {
    throw new Error("No team found for the selected project");
  }

  let data: LinearGraphQLResponse;
  try {
    data = await callLinearGraphQL(apiKey, buildCreateLabelMutation(), {
      teamId,
      name: "symphony",
      color: "#2563eb",
    });
  } catch (error) {
    const message = getErrorMessage(error, "");
    if (message.toLowerCase().includes("duplicate")) {
      return { id: "", name: "symphony", alreadyExists: true };
    }
    throw error;
  }

  const result = (data.data as Record<string, unknown>)?.issueLabelCreate as
    | { success?: boolean; issueLabel?: { id?: string; name?: string } }
    | undefined;

  if (!result?.success || !result.issueLabel?.id || !result.issueLabel?.name) {
    throw new Error("Linear did not confirm label creation");
  }

  return { id: result.issueLabel.id, name: result.issueLabel.name, alreadyExists: false };
}

export function handlePostCreateLabel(deps: SetupApiDeps) {
  return async (_req: Request, res: Response) => {
    const apiKey = getLinearApiKey(deps);
    if (!apiKey) {
      res.status(400).json({ error: { code: "missing_api_key", message: "LINEAR_API_KEY not configured" } });
      return;
    }

    const overlay = deps.configOverlayStore.toMap();
    const projectSlug = readProjectSlug(overlay);
    if (!projectSlug) {
      res.status(400).json({ error: { code: "missing_project", message: "No Linear project selected" } });
      return;
    }

    try {
      const { id, name, alreadyExists } = await createSymphonyLabel(apiKey, projectSlug);
      res.json({ ok: true, labelId: id, labelName: name, alreadyExists });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to create label");
      res.status(502).json({ error: { code: "linear_api_error", message } });
    }
  };
}
