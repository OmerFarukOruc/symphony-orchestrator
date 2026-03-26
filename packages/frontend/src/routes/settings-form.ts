import { TypeCompiler } from "@sinclair/typebox/compiler";
import { WorkflowSchema } from "@symphony/shared";

import { settingsSections } from "./settings-definitions.js";

export type SettingsDrafts = Record<string, string>;
export type SettingsFieldErrors = Record<string, string>;

type SettingsFieldKind = "list" | "number" | "select" | "text";
const dangerousPathSegments = new Set(["__proto__", "constructor", "prototype"]);

export type SettingsFieldDefinition = Readonly<{
  description: string;
  kind: SettingsFieldKind;
  label: string;
  options?: ReadonlyArray<Readonly<{ label: string; value: string }>>;
  path: string;
  placeholder?: string;
}>;

export type SettingsSectionDefinition = Readonly<{
  description: string;
  fields: ReadonlyArray<SettingsFieldDefinition>;
  id: string;
  title: string;
}>;

export type OverlayValidationResult = Readonly<{
  changedFieldPaths: string[];
  fieldErrors: SettingsFieldErrors;
  generalErrors: string[];
  patch: Record<string, unknown>;
}>;

const workflowValidator = TypeCompiler.Compile(WorkflowSchema);

type ParsedDraftResult = Readonly<{ ok: true; value: unknown }> | Readonly<{ message: string; ok: false }>;

export function createInitialDrafts(
  effective: Record<string, unknown>,
  overlay: Record<string, unknown>,
): SettingsDrafts {
  const drafts: SettingsDrafts = {};

  for (const section of settingsSections) {
    for (const field of section.fields) {
      const source = hasValueAtPath(overlay, field.path) ? overlay : effective;
      drafts[field.path] = formatFieldValue(field, getValueAtPath(source, field.path));
    }
  }

  return drafts;
}

function collectFieldChanges(
  drafts: SettingsDrafts,
  effective: Record<string, unknown>,
): { changedFieldPaths: string[]; fieldErrors: SettingsFieldErrors; patch: Record<string, unknown> } {
  const changedFieldPaths: string[] = [];
  const fieldErrors: SettingsFieldErrors = {};
  const patch: Record<string, unknown> = {};

  for (const section of settingsSections) {
    for (const field of section.fields) {
      const parsed = parseDraftValue(field, drafts[field.path] ?? "");
      if (!parsed.ok) {
        fieldErrors[field.path] = parsed.message;
        continue;
      }
      if (isJsonEqual(parsed.value, getValueAtPath(effective, field.path))) {
        continue;
      }
      changedFieldPaths.push(field.path);
      setValueAtPath(patch, field.path, parsed.value);
    }
  }

  return { changedFieldPaths, fieldErrors, patch };
}

export function buildValidatedOverlayPatch(
  drafts: SettingsDrafts,
  effective: Record<string, unknown>,
): OverlayValidationResult {
  const { changedFieldPaths, fieldErrors, patch } = collectFieldChanges(drafts, effective);

  if (Object.keys(fieldErrors).length > 0) {
    return { changedFieldPaths, fieldErrors, generalErrors: [], patch };
  }

  const generalErrors: string[] = [];
  if (!workflowValidator.Check(patch)) {
    for (const error of workflowValidator.Errors(patch)) {
      const path = normalizeErrorPath(error.path);
      if (path && drafts[path] !== undefined) {
        fieldErrors[path] = error.message;
        continue;
      }
      generalErrors.push(error.message);
    }
  }

  return { changedFieldPaths, fieldErrors, generalErrors, patch };
}

export function countSectionOverrides(section: SettingsSectionDefinition, overlay: Record<string, unknown>): number {
  return section.fields.filter((field) => hasValueAtPath(overlay, field.path)).length;
}

export function getValueAtPath(root: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, segment) => {
    if (!isRecord(value) || isDangerousPathSegment(segment) || !Object.hasOwn(value, segment)) {
      return undefined;
    }
    return value[segment];
  }, root);
}

export function hasValueAtPath(root: Record<string, unknown>, path: string): boolean {
  const segments = path.split(".");
  let cursor: unknown = root;

  for (const segment of segments) {
    if (!isRecord(cursor) || !(segment in cursor)) {
      return false;
    }
    cursor = cursor[segment];
  }

  return true;
}

function formatFieldValue(field: SettingsFieldDefinition, value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (field.kind === "list") {
    return Array.isArray(value) ? value.map((entry) => String(entry)).join("\n") : String(value);
  }
  return String(value);
}

function isJsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDangerousPathSegment(segment: string): boolean {
  return dangerousPathSegments.has(segment);
}

function createPathRecord(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

function normalizeErrorPath(path: string): string {
  return path.replaceAll(/^\//g, "").replaceAll("/", ".");
}

function parseDraftValue(field: SettingsFieldDefinition, draft: string): ParsedDraftResult {
  if (field.kind === "number") {
    const value = draft.trim();
    if (!value) {
      return { message: `${field.label} must be a valid number.`, ok: false };
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return { message: `${field.label} must be a valid number.`, ok: false };
    }

    return { ok: true, value: numericValue };
  }

  if (field.kind === "list") {
    return {
      ok: true,
      value: draft
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }

  return { ok: true, value: draft.trim() };
}

function setValueAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let cursor = target;

  for (const segment of segments.slice(0, -1)) {
    if (isDangerousPathSegment(segment)) {
      throw new TypeError(`Refusing to traverse dangerous key: ${segment}`);
    }
    const nested = cursor[segment];
    if (!isRecord(nested)) {
      cursor[segment] = createPathRecord();
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  const leaf = segments.at(-1);
  if (leaf === undefined) {
    throw new TypeError("settings path must contain at least one segment");
  }
  if (isDangerousPathSegment(leaf)) {
    throw new TypeError(`Refusing to set dangerous key: ${leaf}`);
  }
  cursor[leaf] = value;
}
