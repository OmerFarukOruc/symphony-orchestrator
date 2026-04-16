import type { ServiceConfig, WorkflowDefinition } from "../core/types.js";
import { asRecord } from "./coercion.js";
import {
  deriveAgentConfig,
  deriveCodexConfig,
  derivePollingConfig,
  deriveServerConfig,
  deriveTrackerConfig,
  deriveWebhookConfig,
  deriveWorkspaceConfig,
} from "./section-builders.js";
import {
  normalizeAlerts,
  normalizeAutomations,
  normalizeGitHub,
  normalizeNotifications,
  normalizeRepos,
  normalizeStateMachine,
  normalizeTriggers,
} from "./normalizers.js";

export interface DeriveServiceConfigOptions {
  mergedConfigMap?: Record<string, unknown>;
  secretResolver?: (name: string) => string | undefined;
}

interface ConfigDerivationInput {
  tracker: Record<string, unknown>;
  notifications: Record<string, unknown>;
  triggers: unknown;
  automations: unknown;
  alerts: Record<string, unknown>;
  github: Record<string, unknown>;
  repos: unknown;
  polling: Record<string, unknown>;
  workspace: Record<string, unknown>;
  hooks: Record<string, unknown>;
  agent: Record<string, unknown>;
  codex: Record<string, unknown>;
  stateMachine: Record<string, unknown>;
  server: Record<string, unknown>;
  webhook: Record<string, unknown>;
}

function createDerivationInput(mergedConfig: Record<string, unknown>): ConfigDerivationInput {
  const root = asRecord(mergedConfig);
  return {
    tracker: asRecord(root.tracker),
    notifications: asRecord(root.notifications),
    triggers: root.triggers,
    automations: root.automations,
    alerts: asRecord(root.alerts),
    github: asRecord(root.github),
    repos: root.repos,
    polling: asRecord(root.polling),
    workspace: asRecord(root.workspace),
    hooks: asRecord(root.hooks),
    agent: asRecord(root.agent),
    codex: asRecord(root.codex),
    stateMachine: asRecord(root.state_machine),
    server: asRecord(root.server),
    webhook: asRecord(root.webhook),
  };
}

export function deriveServiceConfig(workflow: WorkflowDefinition, options?: DeriveServiceConfigOptions): ServiceConfig {
  const mergedConfig = options?.mergedConfigMap ?? workflow.config;
  const secretResolver = options?.secretResolver;
  const input = createDerivationInput(mergedConfig);
  const tracker = deriveTrackerConfig(input.tracker, secretResolver);

  return {
    tracker,
    notifications: normalizeNotifications(input.notifications, secretResolver),
    triggers: normalizeTriggers(input.triggers, secretResolver),
    automations: normalizeAutomations(input.automations),
    alerts: normalizeAlerts(input.alerts),
    github: normalizeGitHub(input.github, secretResolver),
    repos: normalizeRepos(input.repos),
    polling: derivePollingConfig(input.polling),
    workspace: deriveWorkspaceConfig(input.workspace, input.hooks, secretResolver),
    agent: deriveAgentConfig(input.agent),
    codex: deriveCodexConfig(input.codex, input.agent, secretResolver),
    stateMachine: normalizeStateMachine(input.stateMachine),
    server: deriveServerConfig(input.server),
    webhook: deriveWebhookConfig(input.webhook, secretResolver),
  };
}
