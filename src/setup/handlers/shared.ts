import { buildProjectLookupQuery } from "../../linear/queries.js";
import type { ConfigOverlayPort } from "../../config/overlay.js";
import type { OrchestratorPort } from "../../orchestrator/port.js";
import type { SecretsPort } from "../../secrets/port.js";

export interface SetupApiDeps {
  secretsStore: SecretsPort;
  configOverlayStore: ConfigOverlayPort;
  orchestrator: OrchestratorPort;
  archiveDir: string;
}

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

export interface LinearGraphQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

export async function callLinearGraphQL(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<LinearGraphQLResponse> {
  const response = await fetch(LINEAR_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Linear API returned ${response.status}: ${body}`);
  }

  const data = (await response.json()) as LinearGraphQLResponse;
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join("; "));
  }

  return data;
}

export function getLinearApiKey(deps: SetupApiDeps): string {
  return deps.secretsStore.get("LINEAR_API_KEY") ?? process.env.LINEAR_API_KEY ?? "";
}

export interface ProjectNode {
  id: string;
  name: string;
  slugId: string;
  teams?: { nodes?: Array<{ id: string; key: string }> };
}

export async function lookupProject(apiKey: string, projectSlug: string): Promise<ProjectNode> {
  const data = await callLinearGraphQL(apiKey, buildProjectLookupQuery(), { projectSlug });
  const nodes = ((data.data as Record<string, unknown>)?.projects as Record<string, unknown>)?.nodes as
    | ProjectNode[]
    | undefined;
  const project = nodes?.[0];
  if (!project) {
    throw new Error(`Project "${projectSlug}" not found`);
  }
  return project;
}
