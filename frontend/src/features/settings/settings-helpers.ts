import { buildDiffText, prettyJson, redactPath } from "../../views/config-helpers";
import { buildDefaultSections } from "./settings-section-defs.js";
import { buildSectionPatchPlan } from "./settings-patches";
import { getValueAtPath, setValueAtPath } from "./settings-paths";

export type {
  SettingsFieldOption,
  SettingsFieldDefinition,
  SettingsFieldTier,
  SettingsMode,
  SettingsSectionDefinition,
  SettingsFieldGroup,
} from "./settings-types";
export { SECTION_IDS, SECTION_GROUPS } from "./settings-types";
import type {
  SettingsFieldDefinition,
  SettingsFieldGroup,
  SettingsFieldTier,
  SettingsMode,
  SettingsSectionDefinition,
} from "./settings-types";
import { SECTION_IDS, SECTION_GROUPS } from "./settings-types";

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

/** Check whether a section should be visible in the given display mode. */
export function sectionVisibleInMode(section: SettingsSectionDefinition, mode: SettingsMode): boolean {
  if (mode === "advanced") return true;
  return section.mode !== "advanced";
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
type SectionGroup = (typeof SECTION_GROUPS)[keyof typeof SECTION_GROUPS];
const SECTION_TO_GROUP = new Map<string, SectionGroup>([
  [SECTION_IDS.TRACKER, SECTION_GROUPS.SETUP],
  [SECTION_IDS.REPOSITORIES_GITHUB, SECTION_GROUPS.SETUP],
  [SECTION_IDS.MODEL_PROVIDER_AUTH, SECTION_GROUPS.AGENT],
  [SECTION_IDS.SANDBOX, SECTION_GROUPS.AGENT],
  [SECTION_IDS.AGENT, SECTION_GROUPS.AGENT],
  [SECTION_IDS.CODEX_TIMEOUTS, SECTION_GROUPS.AGENT],
  [SECTION_IDS.WORKSPACE, SECTION_GROUPS.AGENT],
  [SECTION_IDS.NOTIFICATIONS, SECTION_GROUPS.NOTIFICATIONS],
  [SECTION_IDS.WORKFLOW_STAGES, SECTION_GROUPS.SYSTEM],
  [SECTION_IDS.FEATURE_FLAGS, SECTION_GROUPS.SYSTEM],
  [SECTION_IDS.RUNTIME_PATHS, SECTION_GROUPS.SYSTEM],
]);

export function getSectionGroup(sectionId: string): (typeof SECTION_GROUPS)[keyof typeof SECTION_GROUPS] | undefined {
  return SECTION_TO_GROUP.get(sectionId);
}

/** Resolve a field's effective tier: explicit tier > advanced flag > default "essential". */
function resolveFieldTier(field: SettingsFieldDefinition): SettingsFieldTier {
  if (field.tier) return field.tier;
  if (field.advanced === true) return "expert";
  return "essential";
}

export function sectionGroups(section: SettingsSectionDefinition): SettingsFieldGroup[] {
  const groups = new Map<string, SettingsFieldGroup>();
  section.fields.forEach((field, index) => {
    const title = field.group?.trim() || "Settings";
    const tier = resolveFieldTier(field);
    const advanced = tier === "expert";
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
      tier,
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
        .replaceAll(/\s+/g, "-"),
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
