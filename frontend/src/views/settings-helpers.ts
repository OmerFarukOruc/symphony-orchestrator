import { REASONING_EFFORT_OPTIONS } from "../types";
import { buildDiffText, prettyJson, redactPath } from "./config-helpers";
import { buildSectionPatchPlan } from "./settings-patches";
import { getValueAtPath, setValueAtPath } from "./settings-paths";

/** Section IDs used throughout settings for navigation and conditional logic. */
export const SECTION_IDS = {
  TRACKER: "tracker",
  MODEL_PROVIDER_AUTH: "model-provider-auth",
  SANDBOX: "sandbox",
  AGENT: "agent",
  REPOSITORIES_GITHUB: "repositories-github",
  NOTIFICATIONS: "notifications",
  WORKFLOW_STAGES: "workflow-stages",
  FEATURE_FLAGS: "feature-flags",
  RUNTIME_PATHS: "runtime-paths",
  PROMPT_TEMPLATE: "prompt-template",
} as const;

export interface SettingsFieldOption {
  value: string;
  label: string;
}

export interface SettingsFieldDefinition {
  path: string;
  label: string;
  kind: "text" | "number" | "textarea" | "select" | "boolean" | "json" | "list" | "readonly";
  group?: string;
  groupDescription?: string;
  advanced?: boolean;
  hint?: string;
  placeholder?: string;
  options?: SettingsFieldOption[];
  redact?: boolean;
  editable?: boolean;
  /** Label for an inline action button rendered beside the control. */
  actionLabel?: string;
  /** Identifier used by the settings renderer to wire up the correct action handler. */
  actionKind?: string;
}

export interface SettingsSectionDefinition {
  id: string;
  title: string;
  description: string;
  badge: string;
  fields: SettingsFieldDefinition[];
  prefixes: string[];
  saveLabel: string;
}

export interface SettingsFieldGroup {
  id: string;
  title: string;
  description?: string;
  advanced: boolean;
  fields: SettingsFieldDefinition[];
}

export function buildSettingsSections(
  schema: Record<string, unknown> | null,
  effective: Record<string, unknown>,
): SettingsSectionDefinition[] {
  const schemaSections = buildSchemaSections(schema);
  if (schemaSections.length) {
    return schemaSections;
  }
  return buildDefaultSections(effective).map((section) =>
    section.id === "runtime-paths"
      ? {
          ...section,
          fields: section.fields.map((field) => {
            const current = getValueAtPath(effective, field.path);
            if (field.kind === "readonly") {
              return {
                ...field,
                hint: current === undefined ? "Runtime metadata not exposed yet." : field.hint,
              };
            }
            return field;
          }),
        }
      : section,
  );
}

export function isSchemaLimited(schema: Record<string, unknown> | null): boolean {
  return !buildSchemaSections(schema).length;
}

export function sectionMatchesFilter(
  section: SettingsSectionDefinition,
  filter: string,
  drafts: Record<string, string> | undefined,
): boolean {
  if (!filter.trim()) {
    return true;
  }
  const query = filter.trim().toLowerCase();
  const haystacks = [
    section.title,
    section.description,
    section.badge,
    ...section.prefixes,
    ...section.fields.flatMap((field) => [field.label, field.path, field.hint ?? "", drafts?.[field.path] ?? ""]),
  ];
  return haystacks.some((value) => value.toLowerCase().includes(query));
}

export function ensureSectionDrafts(
  drafts: Record<string, Record<string, string>>,
  section: SettingsSectionDefinition,
  effective: Record<string, unknown>,
): Record<string, string> {
  const next = drafts[section.id] ?? {};
  section.fields.forEach((field) => {
    if (next[field.path] !== undefined) {
      return;
    }
    next[field.path] = formatFieldDraft(field, getValueAtPath(effective, field.path));
  });
  drafts[section.id] = next;
  return next;
}

export function formatFieldDraft(field: SettingsFieldDefinition, value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if ((field.redact || isSensitivePath(field.path)) && String(value).length > 0) {
    return "[redacted]";
  }
  if (field.kind === "boolean") {
    return value ? "true" : "false";
  }
  if (field.kind === "json") {
    return prettyJson(value);
  }
  if (field.kind === "list") {
    return Array.isArray(value) ? value.join("\n") : String(value);
  }
  if (field.kind === "readonly") {
    return value === "" ? "not exposed yet" : String(value);
  }
  if (typeof value === "object") {
    return prettyJson(value);
  }
  return String(value);
}

export function buildSectionDiffPreview(
  section: SettingsSectionDefinition,
  drafts: Record<string, string>,
  effective: Record<string, unknown>,
  overlay: Record<string, unknown>,
): string {
  const previewOverlay = structuredClone(overlay) as Record<string, unknown>;
  const plan = buildSectionPatchPlan(section, drafts, effective);
  if (plan.errors.length > 0) {
    const errorMessages = plan.errors.map((error) => `- ${error.message}`).join("\n");
    return `Fix invalid fields before previewing a diff:\n${errorMessages}`;
  }
  plan.entries.forEach((entry) => {
    setValueAtPath(previewOverlay, entry.path, entry.value);
  });
  const effectiveSlice = pickByPrefixes(effective, section.prefixes);
  const overlaySlice = pickByPrefixes(previewOverlay, section.prefixes);
  if (Object.keys(overlaySlice).length === 0) {
    return "No persistent overrides yet for this section.";
  }
  return buildDiffText(effectiveSlice, overlaySlice);
}

export function buildUnderlyingPaths(section: SettingsSectionDefinition): string[] {
  return section.fields.map((field) => field.path);
}

export function getRuntimeMetadataFields(effective: Record<string, unknown>): SettingsFieldDefinition[] {
  const metadataPaths = [
    ["runtime.workflow_path", "Workflow path"],
    ["runtime.data_dir", "Data directory"],
    ["runtime.provider_summary", "Provider summary"],
  ] as const;
  return metadataPaths.map(([path, label]) => ({
    path,
    label,
    kind: "readonly",
    hint:
      getValueAtPath(effective, path) === undefined
        ? "Runtime metadata not exposed yet."
        : "Read-only runtime metadata for operator confidence.",
    editable: false,
  }));
}

export function getSectionById(
  schema: Record<string, unknown> | null,
  effective: Record<string, unknown>,
  sectionId: string,
): SettingsSectionDefinition | undefined {
  return buildSettingsSections(schema, effective).find((section) => section.id === sectionId);
}

export function sectionGroups(section: SettingsSectionDefinition): SettingsFieldGroup[] {
  const groups = new Map<string, SettingsFieldGroup>();
  section.fields.forEach((field, index) => {
    const title = field.group?.trim() || "Settings";
    const advanced = field.advanced === true;
    const key = `${advanced ? "advanced" : "core"}:${title}`;
    const existing = groups.get(key);
    if (existing) {
      existing.fields.push(field);
      if (!existing.description && field.groupDescription) {
        existing.description = field.groupDescription;
      }
      return;
    }
    groups.set(key, {
      id: `${section.id}-group-${index}`,
      title,
      description: field.groupDescription,
      advanced,
      fields: [field],
    });
  });
  return Array.from(groups.values());
}

function buildSchemaSections(schema: Record<string, unknown> | null): SettingsSectionDefinition[] {
  const sections = Array.isArray(schema?.sections) ? schema.sections : [];
  const parsedSections: SettingsSectionDefinition[] = [];
  sections.forEach((rawSection) => {
    if (!rawSection || typeof rawSection !== "object") {
      return;
    }
    const record = rawSection as Record<string, unknown>;
    const fields = Array.isArray(record.fields) ? record.fields : [];
    const parsedFields: SettingsFieldDefinition[] = [];
    fields.forEach((rawField) => {
      if (!rawField || typeof rawField !== "object") {
        return;
      }
      const field = rawField as Record<string, unknown>;
      const path = String(field.path ?? "");
      const label = String(field.label ?? path);
      if (!path) {
        return;
      }
      parsedFields.push({
        path,
        label,
        kind: (field.kind as SettingsFieldDefinition["kind"]) ?? "text",
        hint: typeof field.hint === "string" ? field.hint : undefined,
        placeholder: typeof field.placeholder === "string" ? field.placeholder : undefined,
        editable: field.editable === false ? false : true,
      });
    });
    if (!parsedFields.length) {
      return;
    }
    parsedSections.push({
      id: String(record.id ?? record.title ?? "section")
        .toLowerCase()
        .replace(/\s+/g, "-"),
      title: String(record.title ?? "Section"),
      description: String(record.description ?? "Schema-defined settings section."),
      badge: String(record.badge ?? "schema"),
      fields: parsedFields,
      prefixes: parsedFields.map((field) => field.path),
      saveLabel: String(record.saveLabel ?? "Save section"),
    });
  });
  return parsedSections;
}

function buildDefaultSections(effective: Record<string, unknown>): SettingsSectionDefinition[] {
  const featureFlagPath = getValueAtPath(effective, "feature_flags") !== undefined ? "feature_flags" : "flags";
  return [
    {
      id: "tracker",
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
      title: "Model provider / auth",
      description:
        "Choose the default model, decide how Symphony authenticates, and override provider routing if needed.",
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
      title: "Sandbox",
      description: "Container image, safety posture, and resource controls for each Codex turn.",
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
      title: "Agent",
      description: "Concurrency, retry limits, and continuation controls for worker agents.",
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
      title: "Repositories / GitHub",
      description: "Shaped views over repo routing and GitHub automation config — no extra hidden state.",
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
      title: "Notifications",
      description: "Slack delivery settings surfaced directly from notifications config.",
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
      title: "Workflow stages",
      description: "Stage machine structure for operators who want explicit pipeline control.",
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
      id: "feature-flags",
      title: "Feature flags",
      description: "Operator-facing flag overlay if the runtime exposes flags in config. Otherwise we say so plainly.",
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
      title: "Runtime / paths",
      description:
        "Where Symphony runs, stores workspaces, and listens locally. Missing metadata is shown as not exposed yet.",
      badge: "Runtime info",
      prefixes: ["workspace", "hooks", "polling", "server", "runtime"],
      saveLabel: "Save runtime settings",
      fields: [
        { path: "workspace.root", label: "Workspace root", kind: "text" },
        {
          path: "workspace.strategy",
          label: "Workspace strategy",
          kind: "select",
          hint: "How Symphony manages workspace directories. 'directory' creates folders, 'worktree' uses git worktrees.",
          options: [
            { value: "directory", label: "Directory" },
            { value: "worktree", label: "Worktree" },
          ],
        },
        {
          path: "workspace.branch_prefix",
          label: "Branch prefix",
          kind: "text",
          hint: "Prefix for automatically created branches. Example: symphony/",
          placeholder: "symphony/",
        },
        { path: "hooks.timeout_ms", label: "Hook timeout (ms)", kind: "number" },
        {
          path: "hooks.after_create",
          label: "After create hook",
          kind: "textarea",
          advanced: true,
          hint: "Shell command to run after workspace is created. Available env: WORKSPACE_ROOT, ISSUE_IDENTIFIER.",
        },
        {
          path: "hooks.before_run",
          label: "Before run hook",
          kind: "textarea",
          advanced: true,
          hint: "Shell command to run before agent execution. Available env: WORKSPACE_ROOT, ISSUE_IDENTIFIER.",
        },
        {
          path: "hooks.after_run",
          label: "After run hook",
          kind: "textarea",
          advanced: true,
          hint: "Shell command to run after agent execution. Available env: WORKSPACE_ROOT, ISSUE_IDENTIFIER, ATTEMPT_NUMBER, OUTCOME.",
        },
        {
          path: "hooks.before_remove",
          label: "Before remove hook",
          kind: "textarea",
          advanced: true,
          hint: "Shell command to run before workspace is removed. Available env: WORKSPACE_ROOT, ISSUE_IDENTIFIER.",
        },
        { path: "polling.interval_ms", label: "Polling interval (ms)", kind: "number" },
        { path: "server.port", label: "Server port", kind: "number" },
        ...getRuntimeMetadataFields(effective),
      ],
    },
    {
      id: "prompt-template",
      title: "Prompt template",
      description: "The instructions given to agents when they start working on an issue. Uses Liquid template syntax.",
      badge: "Advanced",
      prefixes: ["prompt_template"],
      saveLabel: "Save prompt template",
      fields: [
        {
          path: "prompt_template",
          label: "Prompt template",
          kind: "textarea",
          hint: "Available variables: {{ issue.identifier }}, {{ issue.title }}, {{ issue.description }}, {{ attempt.number }}, {{ workspace.root }}. The template should include instructions for the agent and end with guidance on when to signal completion.",
          placeholder: "You are working on Linear issue {{ issue.identifier }}: {{ issue.title }}...",
        },
      ],
    },
  ];
}

function pickByPrefixes(source: Record<string, unknown>, prefixes: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  prefixes.forEach((prefix) => {
    const value = getValueAtPath(source, prefix);
    if (value !== undefined) {
      setValueAtPath(next, prefix, value);
    }
  });
  return next;
}

function isSensitivePath(path: string): boolean {
  return redactPath(path, "secret") === "[redacted]";
}
