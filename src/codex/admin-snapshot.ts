import type { PendingUserInputRequest } from "./control-plane.js";
import { CODEX_METHOD } from "./methods.js";
import { readCodexModelCatalog, type CodexModelCatalogReader } from "./model-catalog.js";
import type { SecretsPort } from "../secrets/port.js";
import { asArray, asRecord } from "../utils/type-guards.js";

export interface CodexAdminSnapshot {
  capabilities: {
    connectedAt: string | null;
    initializationError: string | null;
    methods: Record<string, "supported" | "unsupported" | "unknown">;
    notifications: Record<string, "enabled">;
  };
  account: Record<string, unknown> | null;
  requiresOpenaiAuth: boolean;
  rateLimits: Record<string, unknown> | null;
  rateLimitsByLimitId: Record<string, Record<string, unknown>> | null;
  models: unknown[];
  threads: Record<string, unknown>[];
  loadedThreadIds: string[];
  features: Record<string, unknown>[];
  collaborationModes: Record<string, unknown>[];
  mcpServers: Record<string, unknown>[];
  pendingRequests: PendingUserInputRequest[];
}

interface CodexAdminSnapshotReader extends CodexModelCatalogReader {
  getCapabilities(): Promise<CodexAdminSnapshot["capabilities"]>;
  listPendingUserInputRequests(): PendingUserInputRequest[];
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return asArray(value).map((entry) => asRecord(entry));
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((entry): entry is string => typeof entry === "string");
}

function asRecordMapOrNull(value: unknown): Record<string, Record<string, unknown>> | null {
  const record = asRecord(value);
  const entries = Object.entries(record).map(([key, entry]) => [key, asRecord(entry)] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

export async function readCodexAdminSnapshot(deps: {
  controlPlane: CodexAdminSnapshotReader;
  secretsStore?: Pick<SecretsPort, "get">;
}): Promise<CodexAdminSnapshot> {
  const [
    capabilities,
    accountResult,
    rateLimitResult,
    models,
    threadsResult,
    loadedThreadsResult,
    featuresResult,
    collaborationModesResult,
    mcpResult,
  ] = await Promise.all([
    deps.controlPlane.getCapabilities(),
    deps.controlPlane.request(CODEX_METHOD.AccountRead, { refreshToken: false }),
    deps.controlPlane.request(CODEX_METHOD.AccountRateLimitsRead, {}),
    readCodexModelCatalog({ controlPlane: deps.controlPlane, secretsStore: deps.secretsStore }),
    deps.controlPlane.request(CODEX_METHOD.ThreadList, { limit: 10, sortKey: "updated_at" }),
    deps.controlPlane.request(CODEX_METHOD.ThreadLoadedList, {}),
    deps.controlPlane.request(CODEX_METHOD.ExperimentalFeatureList, { limit: 50, cursor: null }),
    deps.controlPlane.request(CODEX_METHOD.CollaborationModeList, {}),
    deps.controlPlane.request(CODEX_METHOD.McpServerStatusList, { limit: 50, cursor: null }),
  ]);

  const account = asRecord(accountResult);
  const rateLimits = asRecord(rateLimitResult);
  const threads = asRecord(threadsResult);
  const features = asRecord(featuresResult);
  const mcp = asRecord(mcpResult);

  return {
    capabilities,
    account: asRecordOrNull(account.account),
    requiresOpenaiAuth: account.requiresOpenaiAuth === true,
    rateLimits: asRecordOrNull(rateLimits.rateLimits),
    rateLimitsByLimitId: asRecordMapOrNull(rateLimits.rateLimitsByLimitId),
    models,
    threads: asRecordArray(threads.data),
    loadedThreadIds: asStringArray(asRecord(loadedThreadsResult).data),
    features: asRecordArray(features.data),
    collaborationModes: asRecordArray(
      Array.isArray(collaborationModesResult) ? collaborationModesResult : asRecord(collaborationModesResult).data,
    ),
    mcpServers: asRecordArray(mcp.data),
    pendingRequests: deps.controlPlane.listPendingUserInputRequests(),
  };
}
