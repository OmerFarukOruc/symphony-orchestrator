export type CodexCapabilityState = "supported" | "unsupported" | "unknown";

export interface CodexCapabilities {
  connectedAt: string | null;
  initializationError: string | null;
  methods: Record<string, CodexCapabilityState>;
  notifications: Record<string, "enabled">;
}

export interface CodexModelCatalogEntry {
  id: string;
  model?: string;
  displayName: string;
  hidden?: boolean;
  supportedReasoningEfforts?: Array<{ reasoningEffort: string; description?: string | null }>;
  defaultReasoningEffort?: string | null;
  inputModalities?: string[];
  supportsPersonality?: boolean;
  isDefault: boolean;
  upgrade?: string | null;
  upgradeInfo?: Record<string, unknown> | null;
}

export interface CodexThreadStatus {
  type?: string;
  activeFlags?: string[];
  [key: string]: unknown;
}

export interface CodexThreadSummary {
  id: string;
  preview?: string;
  name?: string | null;
  ephemeral?: boolean;
  archived?: boolean;
  cwd?: string | null;
  modelProvider?: string | null;
  sourceKind?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  status?: CodexThreadStatus | null;
}

export interface CodexThreadTurnSummary {
  id?: string | null;
  status?: string | null;
  items?: Array<Record<string, unknown>>;
  error?: {
    message?: string | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface CodexThreadDetail extends CodexThreadSummary {
  turns?: CodexThreadTurnSummary[];
}

export interface CodexThreadListResponse {
  data: CodexThreadSummary[];
  nextCursor: string | null;
}

export interface CodexThreadReadResponse {
  thread: CodexThreadDetail;
}

export interface CodexLoadedThreadsResponse {
  data: string[];
}

export interface CodexFeatureEntry {
  name: string;
  stage: string;
  displayName?: string | null;
  description?: string | null;
  announcement?: string | null;
  enabled?: boolean;
  defaultEnabled?: boolean;
}

export interface CodexFeatureListResponse {
  data: CodexFeatureEntry[];
  nextCursor: string | null;
}

export interface CodexCollaborationModeEntry {
  name?: string;
  id?: string;
  displayName?: string | null;
  description?: string | null;
  [key: string]: unknown;
}

export interface CodexMcpServerStatusEntry {
  name: string;
  status?: string | null;
  authStatus?: string | null;
  tools?: unknown[];
  resources?: unknown[];
  [key: string]: unknown;
}

export interface CodexMcpServerStatusListResponse {
  data: CodexMcpServerStatusEntry[];
  nextCursor: string | null;
}

export interface CodexUserInputQuestionOption {
  label: string;
  description?: string;
}

export interface CodexUserInputQuestion {
  id: string;
  header?: string;
  question: string;
  options?: CodexUserInputQuestionOption[];
}

export interface CodexUserInputRequest {
  requestId: string;
  method: string;
  threadId: string | null;
  turnId: string | null;
  questions: CodexUserInputQuestion[];
  createdAt: string;
}

export interface CodexUserInputRequestListResponse {
  data: CodexUserInputRequest[];
}

export interface CodexAccountRecord {
  type?: string | null;
  email?: string | null;
  planType?: string | null;
  accountId?: string | null;
  [key: string]: unknown;
}

export interface CodexAccountResponse {
  account: CodexAccountRecord | null;
  requiresOpenaiAuth?: boolean;
}

export interface CodexRateLimitBucket {
  limitId?: string | null;
  limitName?: string | null;
  primary?: {
    usedPercent?: number | null;
    windowDurationMins?: number | null;
    resetsAt?: number | null;
  } | null;
  secondary?: {
    usedPercent?: number | null;
    windowDurationMins?: number | null;
    resetsAt?: number | null;
  } | null;
}

export interface CodexRateLimitsResponse {
  rateLimits?: CodexRateLimitBucket | null;
  rateLimitsByLimitId?: Record<string, CodexRateLimitBucket> | null;
}

export interface CodexAccountLoginStartResponse {
  type?: string | null;
  loginId?: string | null;
  authUrl?: string | null;
}

export interface CodexAdminSnapshotResponse {
  capabilities: CodexCapabilities;
  account: CodexAccountRecord | null;
  requiresOpenaiAuth: boolean;
  rateLimits?: CodexRateLimitBucket | null;
  rateLimitsByLimitId?: Record<string, CodexRateLimitBucket> | null;
  models: CodexModelCatalogEntry[];
  threads: CodexThreadSummary[];
  loadedThreadIds: string[];
  features: CodexFeatureEntry[];
  collaborationModes: CodexCollaborationModeEntry[];
  mcpServers: CodexMcpServerStatusEntry[];
  pendingRequests: CodexUserInputRequest[];
}
