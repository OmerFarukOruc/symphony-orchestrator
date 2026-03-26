import type { Request, Response } from "express";

import { buildCreateIssueMutation, buildTeamStatesQuery } from "../../linear/queries.js";
import { getErrorMessage } from "../../utils/type-guards.js";
import { readProjectSlug } from "../setup-status.js";
import { callLinearGraphQL, getLinearApiKey, lookupProject, type SetupApiDeps } from "./shared.js";

async function lookupInProgressStateId(apiKey: string, teamId: string): Promise<string> {
  const data = await callLinearGraphQL(apiKey, buildTeamStatesQuery(), { teamId });
  const states = ((data.data as Record<string, unknown>)?.team as Record<string, unknown>)?.states as
    | { nodes?: Array<{ id: string; name: string }> }
    | undefined;
  const inProgress = states?.nodes?.find((s) => s.name.toLowerCase() === "in progress");
  if (!inProgress) {
    throw new Error('No "In Progress" state found for the team');
  }
  return inProgress.id;
}

async function createTestIssue(apiKey: string, projectSlug: string): Promise<{ identifier: string; url: string }> {
  const project = await lookupProject(apiKey, projectSlug);
  const teamId = project.teams?.nodes?.[0]?.id;
  if (!teamId) {
    throw new Error("No team found for the selected project");
  }

  const stateId = await lookupInProgressStateId(apiKey, teamId);
  const data = await callLinearGraphQL(apiKey, buildCreateIssueMutation(), {
    teamId,
    projectId: project.id,
    title: "Symphony smoke test",
    description:
      "This issue was created automatically to verify your Symphony setup. " +
      "Symphony should pick it up within one poll cycle and run a sandboxed agent.",
    stateId,
  });

  const result = (data.data as Record<string, unknown>)?.issueCreate as
    | { success?: boolean; issue?: { identifier?: string; url?: string } }
    | undefined;

  if (!result?.success || !result.issue?.identifier || !result.issue?.url) {
    throw new Error("Linear did not confirm issue creation");
  }

  return { identifier: result.issue.identifier, url: result.issue.url };
}

export function handlePostCreateTestIssue(deps: SetupApiDeps) {
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
      const { identifier, url } = await createTestIssue(apiKey, projectSlug);
      res.json({ ok: true, issueIdentifier: identifier, issueUrl: url });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to create test issue");
      res.status(502).json({ error: { code: "linear_api_error", message } });
    }
  };
}
