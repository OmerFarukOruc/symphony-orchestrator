import type { Request, Response } from "express";

import { isRecord } from "../../utils/type-guards.js";
import type { SetupApiDeps } from "./shared.js";

export function handleGetLinearProjects(deps: SetupApiDeps) {
  return async (_req: Request, res: Response) => {
    const apiKey = deps.secretsStore.get("LINEAR_API_KEY") ?? process.env.LINEAR_API_KEY ?? "";
    if (!apiKey) {
      res.status(400).json({ error: { code: "missing_api_key", message: "LINEAR_API_KEY not configured" } });
      return;
    }

    const query = `{ projects(first: 50) { nodes { id name slugId teams { nodes { key } } } } }`;
    let response: globalThis.Response;
    try {
      response = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: apiKey },
        body: JSON.stringify({ query }),
      });
    } catch (error) {
      res.status(502).json({ error: { code: "linear_api_error", message: String(error) } });
      return;
    }

    if (!response.ok) {
      res.status(502).json({ error: { code: "linear_api_error", message: `Linear API returned ${response.status}` } });
      return;
    }

    const data = (await response.json()) as { data?: { projects?: { nodes?: unknown[] } } };
    const nodes = data.data?.projects?.nodes ?? [];
    const projects = nodes.map((n: unknown) => {
      const node = n as Record<string, unknown>;
      const teams = node.teams as { nodes?: Array<{ key: string }> } | undefined;
      return {
        id: node.id,
        name: node.name,
        slugId: node.slugId,
        teamKey: teams?.nodes?.[0]?.key ?? null,
      };
    });

    res.json({ projects });
  };
}

export function handlePostLinearProject(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
    const body = req.body;
    const slugId = isRecord(body) && typeof body.slugId === "string" ? body.slugId : null;
    if (!slugId) {
      res.status(400).json({ error: { code: "missing_slug_id", message: "slugId is required" } });
      return;
    }

    await deps.configOverlayStore.set("tracker.project_slug", slugId);
    await deps.orchestrator.start();
    deps.orchestrator.requestRefresh("setup");

    res.json({ ok: true });
  };
}
