import type { IconName } from "../ui/icons";
import { buildDiffText, prettyJson, redactPath } from "./config-helpers";
import { buildDefaultSections } from "./settings-section-defs.js";
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
  CREDENTIALS: "credentials",
} as const;

export const SECTION_GROUPS = {
  SETUP: { id: "setup", label: "Setup", icon: "config" as IconName, description: "Connect to external services" },
  AGENT: {
    id: "agent-config",
    label: "Agent",
    icon: "settings" as IconName,
    description: "Configure how Symphony works",
  },
  NOTIFICATIONS: {
    id: "notify",
    label: "Notifications",
    icon: "notifications" as IconName,
    description: "Stay informed",
  },
  SYSTEM: { id: "system", label: "System", icon: "secrets" as IconName, description: "Advanced & security" },
} as const;

export interface SettingsFieldOption {
  value: string;
  label: string;
}

export interface SettingsFieldDefinition {
  path: string;
  label: string;
  kind: "text" | "number" | "textarea" | "select" | "boolean" | "json" | "list" | "readonly" | "credential";
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
  /** References SECTION_GROUPS[*].id */
  groupId?: string;
  /** Visual emphasis for onboarding */
  startHere?: boolean;
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
    const errorLines = plan.errors.map((error) => "- " + error.message).join("\n");
    return `Fix invalid fields before previewing a diff:\n${errorLines}`;
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

export function getSectionById(
  schema: Record<string, unknown> | null,
  effective: Record<string, unknown>,
  sectionId: string,
): SettingsSectionDefinition | undefined {
  return buildSettingsSections(schema, effective).find((section) => section.id === sectionId);
}

/** Static map from section ID to group, derived from SECTION_GROUPS and SECTION_IDS. */
const SECTION_TO_GROUP: ReadonlyMap<string, (typeof SECTION_GROUPS)[keyof typeof SECTION_GROUPS]> = new Map([
  [SECTION_IDS.TRACKER, SECTION_GROUPS.SETUP],
  [SECTION_IDS.REPOSITORIES_GITHUB, SECTION_GROUPS.SETUP],
  [SECTION_IDS.MODEL_PROVIDER_AUTH, SECTION_GROUPS.AGENT],
  [SECTION_IDS.SANDBOX, SECTION_GROUPS.AGENT],
  [SECTION_IDS.AGENT, SECTION_GROUPS.AGENT],
  [SECTION_IDS.NOTIFICATIONS, SECTION_GROUPS.NOTIFICATIONS],
  [SECTION_IDS.WORKFLOW_STAGES, SECTION_GROUPS.SYSTEM],
  [SECTION_IDS.FEATURE_FLAGS, SECTION_GROUPS.SYSTEM],
  [SECTION_IDS.RUNTIME_PATHS, SECTION_GROUPS.SYSTEM],
]);

export function getSectionGroup(sectionId: string): (typeof SECTION_GROUPS)[keyof typeof SECTION_GROUPS] | undefined {
  return SECTION_TO_GROUP.get(sectionId);
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
