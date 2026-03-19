import { parsePathValue } from "./config-helpers";
import type { SettingsFieldDefinition, SettingsSectionDefinition } from "./settings-helpers";
import { getValueAtPath, setValueAtPath } from "./settings-paths";

export interface SettingsDraftIssue {
  path: string;
  message: string;
}

export interface SectionPatchEntry {
  path: string;
  value: unknown;
}

export interface SectionPatchPlan {
  entries: SectionPatchEntry[];
  patch: Record<string, unknown>;
  errors: SettingsDraftIssue[];
}

function parseFieldDraft(
  field: SettingsFieldDefinition,
  value: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (field.kind === "boolean") {
    return { ok: true, value: value === "true" };
  }
  if (field.kind === "number") {
    const trimmed = value.trim();
    if (!trimmed) {
      return { ok: false, message: `${field.label} must be a valid number.` };
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      return { ok: false, message: `${field.label} must be a valid number.` };
    }
    return { ok: true, value: numeric };
  }
  if (field.kind === "list") {
    return {
      ok: true,
      value: value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }
  if (field.kind === "json") {
    return { ok: true, value: parsePathValue(value) };
  }
  return { ok: true, value: field.kind === "readonly" ? value : parsePathValue(value) };
}

export function buildSectionPatchPlan(
  section: SettingsSectionDefinition,
  drafts: Record<string, string>,
  effective: Record<string, unknown>,
): SectionPatchPlan {
  const entries: SectionPatchEntry[] = [];
  const patch: Record<string, unknown> = {};
  const errors: SettingsDraftIssue[] = [];

  section.fields.forEach((field) => {
    if (field.editable === false || field.kind === "readonly") {
      return;
    }

    const draft = drafts[field.path] ?? "";
    const current = getValueAtPath(effective, field.path);
    if (draft === "[redacted]" && current !== undefined) {
      return;
    }

    const parsed = parseFieldDraft(field, draft);
    if (!parsed.ok) {
      errors.push({ path: field.path, message: parsed.message });
      return;
    }

    if (JSON.stringify(parsed.value) === JSON.stringify(current)) {
      return;
    }

    entries.push({ path: field.path, value: parsed.value });
    setValueAtPath(patch, field.path, parsed.value);
  });

  return { entries, patch, errors };
}
