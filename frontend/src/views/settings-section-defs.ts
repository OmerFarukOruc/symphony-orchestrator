import { REASONING_EFFORT_OPTIONS } from "../types.js";

import type { SettingsFieldDefinition, SettingsSectionDefinition } from "./settings-helpers.js";
import { SECTION_GROUPS } from "./settings-helpers.js";
import { getValueAtPath } from "./settings-paths.js";

/** Static section definitions that do not depend on runtime effective config. */
function staticSections(): SettingsSectionDefinition[] {
  return [
    {
      id: "tracker",
      groupId: SECTION_GROUPS.SETUP.id,
      startHere: true,
      title: "Tracker",
      description: "Connect Symphony to your issue tracker and define which states mean 'in progress' vs 'done'.",
      badge: "Start here",
      prefixes: ["tracker"],
      saveLabel: "Save tracker",
      fields: [
        {
          path: "tracker.kind",
          label: "Issue tracker",
          kind: "select",
          group: "Connection",
          groupDescription: "Choose the tracker Symphony should read work from.",
          options: [{ value: "linear", label: "Linear" }],
        },
        {
          path: "tracker.endpoint",
          label: "Endpoint override",
          kind: "text",
          group: "Advanced connection",
          groupDescription: "Only change this if you route tracker traffic through a custom endpoint.",
          advanced: true,
          hint: "Leave blank to use Linear's default GraphQL endpoint.",
        },
        {
          path: "tracker.project_slug",
          label: "Linear project",
          kind: "text",
          group: "Connection",
          hint: "Pick the Linear project Symphony should dispatch from.",
          actionLabel: "Browse",
          actionKind: "browse-linear-projects",
        },
        {
          path: "tracker.active_states",
          label: "States that mean work is active",
          kind: "list",
          group: "Workflow meaning",
          groupDescription: "Tell Symphony which tracker states mean an issue is ready or in progress.",
          hint: "One state per line. Example: Todo, In Progress.",
          placeholder: "Todo\nIn Progress",
        },
        {
          path: "tracker.terminal_states",
          label: "States that mean work is done",
          kind: "list",
          group: "Workflow meaning",
          hint: "One state per line. Example: Done, Canceled.",
          placeholder: "Done\nCanceled",
        },
      ],
    },
    {
      id: "model-provider-auth",
      groupId: SECTION_GROUPS.AGENT.id,
      title: "Model provider / auth",
      description: "Choose which AI model Symphony uses, how it authenticates, and where API requests go.",
      badge: "Core runtime",
      prefixes: ["codex.model", "codex.reasoning_effort", "codex.auth", "codex.provider"],
      saveLabel: "Save provider settings",
      fields: [
        {
          path: "codex.model",
          label: "Default model",
          kind: "text",
          group: "Default model",
          groupDescription: "Set the model Symphony should use unless an issue override is saved.",
        },
        {
          path: "codex.reasoning_effort",
          label: "Reasoning effort",
          kind: "select",
          group: "Default model",
          options: REASONING_EFFORT_OPTIONS.map((value) => ({ value, label: value })),
        },
        {
          path: "codex.auth.mode",
          label: "How to authenticate",
          kind: "select",
          group: "Authentication",
          groupDescription: "Use an API key or your local OpenAI login, depending on how you run Codex.",
          options: [
            { value: "api_key", label: "API key" },
            { value: "openai_login", label: "OpenAI login" },
          ],
        },
        {
          path: "codex.auth.source_home",
          label: "Auth directory",
          kind: "text",
          group: "Authentication",
          advanced: true,
          hint: "Local directory where auth credentials are stored.",
        },
        {
          path: "codex.provider.id",
          label: "Provider id",
          kind: "text",
          group: "Provider routing",
          groupDescription: "Only fill these in when routing Codex through a custom or OpenAI-compatible provider.",
          advanced: true,
          placeholder: "custom",
        },
        {
          path: "codex.provider.name",
          label: "Provider name",
          kind: "text",
          group: "Provider routing",
          advanced: true,
        },
        {
          path: "codex.provider.base_url",
          label: "Base URL",
          kind: "text",
          group: "Provider routing",
          advanced: true,
        },
        {
          path: "codex.provider.env_key",
          label: "API key env var",
          kind: "text",
          group: "Provider routing",
          advanced: true,
          redact: true,
          hint: "Name of the environment variable holding your API key.",
        },
        {
          path: "codex.provider.wire_api",
          label: "API protocol",
          kind: "text",
          group: "Provider routing",
          advanced: true,
          placeholder: "responses",
          hint: "Wire protocol used to communicate with this provider (e.g. responses).",
        },
        {
          path: "codex.provider.requires_openai_auth",
          label: "Requires OpenAI authentication",
          kind: "boolean",
          group: "Provider routing",
          advanced: true,
        },
        {
          path: "codex.provider.env_http_headers",
          label: "Custom HTTP header env vars",
          kind: "json",
          group: "Provider routing",
          advanced: true,
          hint: "Map of HTTP header names to environment variable names.",
        },
      ],
    },
    {
      id: "sandbox",
      groupId: SECTION_GROUPS.AGENT.id,
      title: "Sandbox",
      description:
        "Control how safely Symphony runs code — set container image, security restrictions, and resource limits.",
      badge: "Execution safety",
      prefixes: ["codex.approval_policy", "codex.thread_sandbox", "codex.turn_sandbox_policy", "codex.sandbox"],
      saveLabel: "Save sandbox",
      fields: [
        {
          path: "codex.approval_policy",
          label: "Approval policy",
          kind: "json",
          group: "Safety",
          groupDescription: "Decide which actions need explicit approval before they run.",
          hint: "Controls which operations require human approval before execution.",
        },
        {
          path: "codex.thread_sandbox",
          label: "Thread sandbox",
          kind: "text",
          group: "Container",
          groupDescription: "Choose the default sandbox mode and container image for each turn.",
        },
        {
          path: "codex.turn_sandbox_policy",
          label: "Turn sandbox policy",
          kind: "json",
          group: "Safety",
          advanced: true,
          hint: "Per-turn policy overriding the default sandbox behavior.",
        },
        { path: "codex.sandbox.image", label: "Sandbox image", kind: "text", group: "Container" },
        {
          path: "codex.sandbox.network",
          label: "Network access",
          kind: "text",
          group: "Container",
          advanced: true,
        },
        {
          path: "codex.sandbox.security.no_new_privileges",
          label: "No new privileges",
          kind: "boolean",
          group: "Safety",
          advanced: true,
        },
        {
          path: "codex.sandbox.security.drop_capabilities",
          label: "Drop capabilities",
          kind: "boolean",
          group: "Safety",
          advanced: true,
        },
        {
          path: "codex.sandbox.security.gvisor",
          label: "Use gVisor",
          kind: "boolean",
          group: "Safety",
          advanced: true,
        },
        {
          path: "codex.sandbox.resources.memory",
          label: "Memory",
          kind: "text",
          group: "Resources",
          groupDescription: "Optional resource caps for each sandboxed run.",
          advanced: true,
        },
        { path: "codex.sandbox.resources.cpus", label: "CPUs", kind: "text", group: "Resources", advanced: true },
        {
          path: "codex.sandbox.resources.tmpfs_size",
          label: "Tmpfs size",
          kind: "text",
          group: "Resources",
          advanced: true,
        },
      ],
    },
    {
      id: "agent",
      groupId: SECTION_GROUPS.AGENT.id,
      title: "Agent",
      description: "Set how many tasks Symphony runs in parallel, how long each can take, and when to retry.",
      badge: "Core runtime",
      prefixes: ["agent"],
      saveLabel: "Save agent settings",
      fields: [
        {
          path: "agent.max_concurrent_agents",
          label: "Max concurrent agents",
          kind: "number",
          group: "Throughput",
          groupDescription: "Control how much work Symphony runs in parallel.",
        },
        { path: "agent.max_turns", label: "Max turns", kind: "number", group: "Throughput" },
        {
          path: "agent.max_continuation_attempts",
          label: "Max continuation attempts",
          kind: "number",
          group: "Continuation",
          groupDescription: "Prevent long-running issues from looping forever without a stop signal.",
          hint: "How many times an agent can retry without emitting a stop signal before being stopped. Default: 5.",
        },
        {
          path: "agent.max_retry_backoff_ms",
          label: "Max retry backoff (ms)",
          kind: "number",
          group: "Retries",
          groupDescription: "Tune how long Symphony waits before retrying failed work.",
          advanced: true,
        },
      ],
    },
    {
      id: "repositories-github",
      groupId: SECTION_GROUPS.SETUP.id,
      title: "Repositories / GitHub",
      description: "Connect Symphony to your GitHub repos and configure automation settings.",
      badge: "Integration",
      prefixes: ["repos", "github"],
      saveLabel: "Save repository settings",
      fields: [
        { path: "repos", label: "Repository routing", kind: "json", hint: "JSON array of repo routing rules." },
        { path: "github.api_base_url", label: "GitHub API base URL", kind: "text" },
        {
          path: "github.token",
          label: "GitHub token",
          kind: "text",
          redact: true,
          hint: "Redacted after load for safety.",
        },
      ],
    },
    {
      id: "notifications",
      groupId: SECTION_GROUPS.NOTIFICATIONS.id,
      title: "Notifications",
      description: "Get notified in Slack when work completes, fails, or needs attention.",
      badge: "Integration",
      prefixes: ["notifications"],
      saveLabel: "Save notifications",
      fields: [
        {
          path: "notifications.slack.verbosity",
          label: "Slack verbosity",
          kind: "select",
          options: ["off", "critical", "verbose"].map((value) => ({ value, label: value })),
        },
        {
          path: "notifications.slack.webhook_url",
          label: "Slack webhook URL",
          kind: "text",
          redact: true,
          hint: "Existing webhook values stay redacted. Enter a new one to replace it.",
        },
      ],
    },
    {
      id: "workflow-stages",
      groupId: SECTION_GROUPS.SYSTEM.id,
      title: "Workflow stages",
      description: "Define custom pipeline stages if the default linear flow doesn't fit your workflow.",
      badge: "Advanced",
      prefixes: ["state_machine"],
      saveLabel: "Save workflow stages",
      fields: [
        { path: "state_machine.stages", label: "Stages", kind: "json", hint: "JSON array of stage definitions." },
        {
          path: "state_machine.transitions",
          label: "Transitions",
          kind: "json",
          hint: "JSON object keyed by source stage.",
        },
      ],
    },
    {
      id: "credentials",
      groupId: SECTION_GROUPS.SYSTEM.id,
      title: "Credentials",
      description: "Store encrypted API keys and tokens that Symphony needs to connect to external services.",
      badge: "Security",
      prefixes: ["secrets"],
      saveLabel: "Manage credentials",
      fields: [
        {
          path: "secrets",
          label: "Stored credentials",
          kind: "credential",
          hint: "Values are encrypted at rest. After saving, only the key name is visible — values remain write-only.",
        },
      ],
    },
  ];
}

/** Sections whose shape depends on the runtime effective config. */
function dynamicSections(effective: Record<string, unknown>): SettingsSectionDefinition[] {
  const featureFlagPath = getValueAtPath(effective, "feature_flags") !== undefined ? "feature_flags" : "flags";
  return [
    {
      id: "feature-flags",
      groupId: SECTION_GROUPS.SYSTEM.id,
      title: "Feature flags",
      description: "Toggle experimental features when the runtime exposes them.",
      badge: "Runtime dependent",
      prefixes: [featureFlagPath],
      saveLabel: "Save flags",
      fields: [
        getValueAtPath(effective, featureFlagPath) === undefined
          ? {
              path: "runtime.feature_flags",
              label: "Feature flags",
              kind: "readonly",
              hint: "Feature flag metadata not exposed yet.",
              editable: false,
            }
          : {
              path: featureFlagPath,
              label: "Feature flags",
              kind: "json",
              hint: "JSON object keyed by feature flag name.",
            },
      ],
    },
    {
      id: "runtime-paths",
      groupId: SECTION_GROUPS.SYSTEM.id,
      title: "Runtime / paths",
      description: "Where Symphony stores data, how often it polls for changes, and which port it uses.",
      badge: "Runtime info",
      prefixes: ["workspace", "hooks", "polling", "server", "runtime"],
      saveLabel: "Save runtime settings",
      fields: [
        { path: "workspace.root", label: "Workspace root", kind: "text" },
        { path: "hooks.timeout_ms", label: "Hook timeout (ms)", kind: "number" },
        { path: "polling.interval_ms", label: "Polling interval (ms)", kind: "number" },
        { path: "server.port", label: "Server port", kind: "number" },
        ...getRuntimeMetadataFields(effective),
      ],
    },
  ];
}

/** Build runtime metadata fields for the runtime-paths section. */
function getRuntimeMetadataFields(effective: Record<string, unknown>): SettingsFieldDefinition[] {
  const metadataPaths = [
    ["runtime.workflow_path", "Workflow path"],
    ["runtime.data_dir", "Data directory"],
    ["runtime.provider_summary", "Provider summary"],
  ] as const;
  return metadataPaths.map(([path, label]) => ({
    path,
    label,
    kind: "readonly" as const,
    hint:
      getValueAtPath(effective, path) === undefined
        ? "Runtime metadata not exposed yet."
        : "Read-only runtime metadata for operator confidence.",
    editable: false,
  }));
}

/**
 * Assemble all default section definitions.
 *
 * Static sections come first (tracker through credentials), then
 * dynamic sections whose shape depends on effective config values
 * (feature-flags, runtime-paths).
 */
export function buildDefaultSections(effective: Record<string, unknown>): SettingsSectionDefinition[] {
  const sections = staticSections();
  // Insert dynamic sections before the last entry (credentials) so
  // credentials stays at the bottom of the sidebar.
  const credentialsSection = sections.pop()!;
  return [...sections, ...dynamicSections(effective), credentialsSection];
}
