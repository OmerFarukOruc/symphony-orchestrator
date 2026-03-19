import type { PlannedIssue } from "../planning/skill.js";
import type { ServiceConfig } from "../core/types.js";
import { asArray, asBooleanOrNull, asRecord, asStringOrNull } from "../utils/type-guards.js";

interface LinearPlanTarget {
  teamId: string;
  projectId: string | null;
  labelIdsByName: Map<string, string>;
}

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: unknown[];
}

function extractNodesConnection(
  payload: GraphQLResponse,
  fieldName: string,
): { nodes: Record<string, unknown>[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } | null } {
  if (Object.hasOwn(payload, "data") === false || typeof payload.data !== "object" || payload.data === null) {
    throw new Error("linear graphql response missing data object");
  }
  const root = payload.data;
  const connection = asRecord(root[fieldName]);
  const nodes = asArray(connection.nodes).map((node) => asRecord(node));
  const pageInfoRecord = asRecord(connection.pageInfo);
  const hasNextPage = asBooleanOrNull(pageInfoRecord.hasNextPage);
  const endCursor = asStringOrNull(pageInfoRecord.endCursor);

  return {
    nodes,
    pageInfo:
      hasNextPage === null
        ? null
        : {
            hasNextPage,
            endCursor,
          },
  };
}

export async function resolvePlanTarget(input: {
  issues: PlannedIssue[];
  config: ServiceConfig;
  runGraphQL: (query: string, variables?: Record<string, unknown>) => Promise<GraphQLResponse>;
  buildProjectLookupQuery: () => string;
  buildTeamLookupQuery: () => string;
  buildLabelLookupQuery: () => string;
}): Promise<LinearPlanTarget> {
  const { issues, config } = input;
  let teamId: string;
  let projectId: string | null;

  if (config.tracker.projectSlug) {
    const payload = await input.runGraphQL(input.buildProjectLookupQuery(), {
      projectSlug: config.tracker.projectSlug,
    });
    const { nodes } = extractNodesConnection(payload, "projects");
    const project = nodes[0];
    const teams = asArray(asRecord(asRecord(project).teams).nodes).map((team) => asRecord(team));
    const firstTeam = teams[0];
    const resolvedProjectId = asStringOrNull(project?.id);
    const resolvedTeamId = asStringOrNull(firstTeam?.id);

    if (!resolvedProjectId || !resolvedTeamId) {
      throw new Error(`unable to resolve Linear project for slug ${config.tracker.projectSlug}`);
    }
    projectId = resolvedProjectId;
    teamId = resolvedTeamId;
  } else {
    projectId = null;
    const payload = await input.runGraphQL(input.buildTeamLookupQuery());
    const { nodes } = extractNodesConnection(payload, "teams");
    if (nodes.length !== 1) {
      throw new Error(
        `unable to resolve a unique Linear team without tracker.project_slug; found ${nodes.length} teams`,
      );
    }
    const resolvedTeamId = asStringOrNull(nodes[0]?.id);
    if (!resolvedTeamId) {
      throw new Error("unable to resolve Linear team id");
    }
    teamId = resolvedTeamId;
  }

  const labelNames = [...new Set(issues.flatMap((issue) => issue.labels.map((label) => label.trim().toLowerCase())))];
  if (labelNames.length === 0) {
    return {
      teamId,
      projectId,
      labelIdsByName: new Map(),
    };
  }

  const payload = await input.runGraphQL(input.buildLabelLookupQuery(), {
    teamId,
    names: labelNames,
  });
  const { nodes } = extractNodesConnection(payload, "issueLabels");
  const labelIdsByName = new Map<string, string>();
  for (const label of nodes) {
    const id = asStringOrNull(label.id);
    const name = asStringOrNull(label.name)?.trim().toLowerCase();
    if (!id || !name) {
      continue;
    }
    labelIdsByName.set(name, id);
  }

  return {
    teamId,
    projectId,
    labelIdsByName,
  };
}
