import type { ReasoningEffort } from "./model.js";

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

export interface CodexConfig {
  command: string;
  model: string;
  reasoningEffort: ReasoningEffort | null;
  approvalPolicy: string | Record<string, unknown>;
  threadSandbox: string;
  personality: string;
  turnSandboxPolicy: { type: string; [key: string]: unknown };
  selfReview: boolean;
  readTimeoutMs: number;
  turnTimeoutMs: number;
  drainTimeoutMs: number;
  startupTimeoutMs: number;
  stallTimeoutMs: number;
  structuredOutput: boolean;
  auth: CodexAuthConfig;
  provider: CodexProviderConfig | null;
  sandbox: SandboxConfig;
}
