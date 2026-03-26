import type { Request, Response } from "express";

import { buildCreateProjectMutation, buildTeamsQuery } from "../../linear/queries.js";
import { getErrorMessage, isRecord } from "../../utils/type-guards.js";
import { callLinearGraphQL, getLinearApiKey, type SetupApiDeps } from "./shared.js";

interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

interface ProjectCreateResult {
  success?: boolean;
  project?: {
    id?: string;
    name?: string;
    slugId?: string;
    url?: string;
    teams?: { nodes?: Array<{ key: string }> };
  };
}

async function fetchLinearTeams(apiKey: string): Promise<LinearTeam[]> {
  const teamsData = await callLinearGraphQL(apiKey, buildTeamsQuery(), {});
  return (
    (((teamsData.data as Record<string, unknown>)?.teams as Record<string, unknown>)?.nodes as
      | LinearTeam[]
      | undefined) ?? []
  );
}

async function createLinearProject(apiKey: string, name: string, teamIds: string[]): Promise<ProjectCreateResult> {
  const data = await callLinearGraphQL(apiKey, buildCreateProjectMutation(), { name, teamIds });
  return ((data.data as Record<string, unknown>)?.projectCreate as ProjectCreateResult | undefined) ?? {};
}

function parseProjectName(body: unknown): string | null {
  if (!isRecord(body) || typeof body.name !== "string") return null;
  const name = body.name.trim();
  return name || null;
}

export function handlePostCreateProject(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
    const apiKey = getLinearApiKey(deps);
    if (!apiKey) {
      res.status(400).json({ error: { code: "missing_api_key", message: "LINEAR_API_KEY not configured" } });
      return;
    }

    const name = parseProjectName(req.body);
    if (!name) {
      res.status(400).json({ error: { code: "missing_name", message: "Project name is required" } });
      return;
    }

    try {
      const teams = await fetchLinearTeams(apiKey);
      if (!teams.length) {
        res.status(400).json({ error: { code: "no_teams", message: "No teams found in your Linear workspace" } });
        return;
      }

      const result = await createLinearProject(apiKey, name, [teams[0].id]);
      if (!result?.success || !result.project?.slugId) {
        throw new Error("Linear did not confirm project creation");
      }

      res.json({
        ok: true,
        project: {
          id: result.project.id,
          name: result.project.name,
          slugId: result.project.slugId,
          url: result.project.url ?? null,
          teamKey: result.project.teams?.nodes?.[0]?.key ?? teams[0].key,
        },
      });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to create project");
      res.status(502).json({ error: { code: "linear_api_error", message } });
    }
  };
}
