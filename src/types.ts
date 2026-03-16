export interface WorkflowDefinition {
  config: Record<string, unknown>;
  promptTemplate: string;
}

export interface IssueBlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  blockedBy: IssueBlockerRef[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Workspace {
  path: string;
  workspaceKey: string;
  createdNow: boolean;
}

export interface RunOutcome {
  kind: "normal" | "failed" | "timed_out" | "stalled" | "cancelled";
  errorCode: string | null;
  errorMessage: string | null;
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
}

export interface RetryEntry {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  error: string | null;
  timer: NodeJS.Timeout | null;
}

export interface RecentEvent {
  at: string;
  issueId: string | null;
  issueIdentifier: string | null;
  sessionId: string | null;
  event: string;
  message: string;
  content?: string | null;
}

export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ModelSelection {
  model: string;
  reasoningEffort: ReasoningEffort | null;
  source: "default" | "override";
}

export interface AttemptRecord {
  attemptId: string;
  issueId: string;
  issueIdentifier: string;
  title: string;
  workspaceKey: string | null;
  workspacePath: string | null;
  status: "running" | "completed" | "failed" | "timed_out" | "stalled" | "cancelled" | "paused";
  attemptNumber: number | null;
  startedAt: string;
  endedAt: string | null;
  model: string;
  reasoningEffort: ReasoningEffort | null;
  modelSource: "default" | "override";
  threadId: string | null;
  turnId: string | null;
  turnCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  tokenUsage: TokenUsageSnapshot | null;
}

export interface AttemptEvent extends RecentEvent {
  attemptId: string;
  usage?: TokenUsageSnapshot | null;
  rateLimits?: unknown;
  content?: string | null;
}

export interface RuntimeIssueView {
  issueId: string;
  identifier: string;
  title: string;
  state: string;
  workspaceKey: string | null;
  workspacePath?: string | null;
  message: string | null;
  status: string;
  updatedAt: string;
  attempt: number | null;
  error: string | null;
  priority?: number | null;
  labels?: string[];
  startedAt?: string | null;
  lastEventAt?: string | null;
  tokenUsage?: TokenUsageSnapshot | null;
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  modelSource?: "default" | "override" | null;
  configuredModel?: string | null;
  configuredReasoningEffort?: ReasoningEffort | null;
  configuredModelSource?: "default" | "override" | null;
  modelChangePending?: boolean;
}

export interface RuntimeSnapshot {
  generatedAt: string;
  counts: { running: number; retrying: number };
  running: RuntimeIssueView[];
  retrying: RuntimeIssueView[];
  queued?: RuntimeIssueView[];
  completed?: RuntimeIssueView[];
  codexTotals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    secondsRunning: number;
  };
  rateLimits: unknown | null;
  recentEvents: RecentEvent[];
}

export interface ValidationError {
  code: string;
  message: string;
}

export interface TrackerConfig {
  kind: "linear";
  apiKey: string;
  projectSlug: string | null;
}

export interface PollingConfig {
  intervalMs: number;
}

export interface WorkspaceHooks {
  afterCreate: string | null;
  beforeRun: string | null;
  afterRun: string | null;
  beforeRemove: string | null;
  timeoutMs: number;
}

export interface WorkspaceConfig {
  root: string;
  hooks: WorkspaceHooks;
}

export interface AgentConfig {
  maxConcurrentAgents: number;
  maxTurns: number;
  maxRetryBackoffMs: number;
}

export interface SandboxSecurityConfig {
  noNewPrivileges: boolean;
  dropCapabilities: boolean;
  gvisor: boolean;
}

export interface SandboxResourceConfig {
  memory: string;
  memoryReservation: string;
  memorySwap: string;
  cpus: string;
  tmpfsSize: string;
}

export interface SandboxLogConfig {
  driver: string;
  maxSize: string;
  maxFile: number;
}

export interface SandboxConfig {
  enabled: boolean;
  image: string;
  network: string;
  security: SandboxSecurityConfig;
  resources: SandboxResourceConfig;
  extraMounts: string[];
  envPassthrough: string[];
  logs: SandboxLogConfig;
}

export interface CodexConfig {
  command: string;
  model: string;
  reasoningEffort: ReasoningEffort | null;
  approvalPolicy: string | Record<string, unknown>;
  threadSandbox: string;
  turnSandboxPolicy: { type: string; [key: string]: unknown };
  readTimeoutMs: number;
  turnTimeoutMs: number;
  stallTimeoutMs: number;
  sandbox: SandboxConfig;
}

export interface ServerConfig {
  port: number;
}

export interface ServiceConfig {
  tracker: TrackerConfig;
  polling: PollingConfig;
  workspace: WorkspaceConfig;
  agent: AgentConfig;
  codex: CodexConfig;
  server: ServerConfig;
}

export interface SymphonyLogger {
  debug(meta: unknown, message?: string): void;
  info(meta: unknown, message?: string): void;
  warn(meta: unknown, message?: string): void;
  error(meta: unknown, message?: string): void;
  child(meta: Record<string, unknown>): SymphonyLogger;
}
