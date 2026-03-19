import { buildDiffText, prettyJson, redactPath } from "./config-helpers";
import { buildSectionPatchPlan } from "./settings-patches";
import { getValueAtPath, setValueAtPath } from "./settings-paths";

export interface SettingsFieldOption {
  value: string;
  label: string;
}

export interface SettingsFieldDefinition {
  path: string;
  label: string;
  kind: "text" | "number" | "textarea" | "select" | "boolean" | "json" | "list" | "readonly";
  hint?: string;
  placeholder?: string;
  options?: SettingsFieldOption[];
  redact?: boolean;
  editable?: boolean;
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
    return `Fix invalid fields before previewing a diff:\n${plan.errors.map((error) => `- ${error.message}`).join("\n")}`;
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
      description: "Where Symphony pulls work from and which workflow states count as active or terminal.",
      badge: "Novice-friendly",
      prefixes: ["tracker"],
      saveLabel: "Save tracker",
      fields: [
        {
          path: "tracker.kind",
          label: "Tracker kind",
          kind: "select",
          options: [{ value: "linear", label: "Linear" }],
        },
        {
          path: "tracker.endpoint",
          label: "Tracker endpoint",
          kind: "text",
          hint: "Defaults to Linear GraphQL unless overridden.",
        },
        {
          path: "tracker.project_slug",
          label: "Project slug",
          kind: "text",
          hint: "The Linear project slug Symphony dispatches from.",
        },
        { path: "tracker.active_states", label: "Active states", kind: "list", hint: "One state per line." },
        { path: "tracker.terminal_states", label: "Terminal states", kind: "list", hint: "One state per line." },
      ],
    },
    {
      id: "model-provider-auth",
      title: "Model provider / auth",
      description: "Default Codex model, provider routing, and operator authentication settings.",
      badge: "Core runtime",
      prefixes: ["codex.model", "codex.reasoning_effort", "codex.auth", "codex.provider"],
      saveLabel: "Save provider settings",
      fields: [
        { path: "codex.model", label: "Default model", kind: "text" },
        {
          path: "codex.reasoning_effort",
          label: "Reasoning effort",
          kind: "select",
          options: ["none", "minimal", "low", "medium", "high", "xhigh"].map((value) => ({ value, label: value })),
        },
        {
          path: "codex.auth.mode",
          label: "Auth mode",
          kind: "select",
          options: [
            { value: "api_key", label: "API key" },
            { value: "openai_login", label: "OpenAI login" },
          ],
        },
        { path: "codex.auth.source_home", label: "Auth source home", kind: "text" },
        { path: "codex.provider.id", label: "Provider id", kind: "text", placeholder: "custom" },
        { path: "codex.provider.name", label: "Provider name", kind: "text" },
        { path: "codex.provider.base_url", label: "Base URL", kind: "text" },
        { path: "codex.provider.env_key", label: "API key env var", kind: "text", redact: true },
        { path: "codex.provider.wire_api", label: "Wire API", kind: "text", placeholder: "responses" },
        { path: "codex.provider.requires_openai_auth", label: "Requires OpenAI auth", kind: "boolean" },
        {
          path: "codex.provider.env_http_headers",
          label: "Provider header env mapping",
          kind: "json",
          hint: "JSON object of header name to env var name.",
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
        { path: "codex.approval_policy", label: "Approval policy", kind: "json" },
        { path: "codex.thread_sandbox", label: "Thread sandbox", kind: "text" },
        { path: "codex.turn_sandbox_policy", label: "Turn sandbox policy", kind: "json" },
        { path: "codex.sandbox.image", label: "Sandbox image", kind: "text" },
        { path: "codex.sandbox.network", label: "Network", kind: "text" },
        { path: "codex.sandbox.security.no_new_privileges", label: "No new privileges", kind: "boolean" },
        { path: "codex.sandbox.security.drop_capabilities", label: "Drop capabilities", kind: "boolean" },
        { path: "codex.sandbox.security.gvisor", label: "Use gVisor", kind: "boolean" },
        { path: "codex.sandbox.resources.memory", label: "Memory", kind: "text" },
        { path: "codex.sandbox.resources.cpus", label: "CPUs", kind: "text" },
        { path: "codex.sandbox.resources.tmpfs_size", label: "tmpfs size", kind: "text" },
      ],
    },
    {
      id: "repositories-github",
      title: "Repositories / GitHub",
      description: "Shaped views over repo routing and GitHub automation config — no extra hidden state.",
      badge: "Shaped view",
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
      badge: "Shaped view",
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
      badge: "Operator confidence",
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
