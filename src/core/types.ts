import type { NotificationVerbosity } from "./notification-types.js";

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
  pullRequestUrl?: string | null;
  stopSignal?: "done" | "blocked" | null;
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
  url?: string | null;
  description?: string | null;
  blockedBy?: IssueBlockerRef[];
  branchName?: string | null;
  pullRequestUrl?: string | null;
  nextRetryDueAt?: string | null;
  createdAt?: string | null;
}

export interface WorkflowColumnView {
  key: string;
  label: string;
  kind: "backlog" | "todo" | "active" | "gate" | "terminal" | "other";
  terminal: boolean;
  count: number;
  issues: RuntimeIssueView[];
}

export interface RuntimeSnapshot {
  generatedAt: string;
  counts: { running: number; retrying: number };
  running: RuntimeIssueView[];
  retrying: RuntimeIssueView[];
  queued?: RuntimeIssueView[];
  completed?: RuntimeIssueView[];
  workflowColumns: WorkflowColumnView[];
  codexTotals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    secondsRunning: number;
  };
  rateLimits: unknown;
  recentEvents: RecentEvent[];
}

export interface ValidationError {
  code: string;
  message: string;
}

export interface TrackerConfig {
  kind: string;
  apiKey: string;
  endpoint: string;
  projectSlug: string | null;
  activeStates: string[];
  terminalStates: string[];
}

export interface NotificationSlackConfig {
  webhookUrl: string;
  verbosity: NotificationVerbosity;
}

export interface NotificationConfig {
  slack: NotificationSlackConfig | null;
}

export interface GitHubConfig {
  token: string;
  apiBaseUrl: string;
}

export interface RepoConfig {
  repoUrl: string;
  defaultBranch: string;
  identifierPrefix: string | null;
  label: string | null;
  githubOwner?: string | null;
  githubRepo?: string | null;
  githubTokenEnv?: string | null;
}

export interface PollingConfig {
  intervalMs: number;
}

interface WorkspaceHooks {
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
  maxConcurrentAgentsByState: Record<string, number>;
  maxTurns: number;
  maxRetryBackoffMs: number;
}

export interface SandboxSecurityConfig {
  noNewPrivileges: boolean;
  dropCapabilities: boolean;
  gvisor: boolean;
  seccompProfile: string;
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
  image: string;
  network: string;
  security: SandboxSecurityConfig;
  resources: SandboxResourceConfig;
  extraMounts: string[];
  envPassthrough: string[];
  logs: SandboxLogConfig;
  egressAllowlist: string[];
}

export type CodexAuthMode = "api_key" | "openai_login";

export interface CodexAuthConfig {
  mode: CodexAuthMode;
  sourceHome: string;
}

export interface CodexProviderConfig {
  id: string | null;
  name: string | null;
  baseUrl: string | null;
  envKey: string | null;
  envKeyInstructions: string | null;
  wireApi: string | null;
  requiresOpenaiAuth: boolean;
  httpHeaders: Record<string, string>;
  envHttpHeaders: Record<string, string>;
  queryParams: Record<string, string>;
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
  drainTimeoutMs: number;
  startupTimeoutMs: number;
  stallTimeoutMs: number;
  auth: CodexAuthConfig;
  provider: CodexProviderConfig | null;
  sandbox: SandboxConfig;
}

export interface ServerConfig {
  port: number;
}

export type StateStageKind = "backlog" | "todo" | "active" | "gate" | "terminal";

export interface StateStageConfig {
  name: string;
  kind: StateStageKind;
}

export interface StateMachineConfig {
  stages: StateStageConfig[];
  transitions: Record<string, string[]>;
}

export interface ServiceConfig {
  tracker: TrackerConfig;
  notifications?: NotificationConfig;
  github?: GitHubConfig | null;
  repos?: RepoConfig[];
  polling: PollingConfig;
  workspace: WorkspaceConfig;
  agent: AgentConfig;
  codex: CodexConfig;
  stateMachine?: StateMachineConfig | null;
  server: ServerConfig;
}

export interface SymphonyLogger {
  debug(meta: unknown, message?: string): void;
  info(meta: unknown, message?: string): void;
  warn(meta: unknown, message?: string): void;
  error(meta: unknown, message?: string): void;
  child(meta: Record<string, unknown>): SymphonyLogger;
}
