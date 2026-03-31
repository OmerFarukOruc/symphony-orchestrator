/**
 * Shared settings types and constants, extracted to break the import cycle
 * between settings-helpers.ts, settings-section-defs.ts, and settings-patches.ts.
 */

import type { IconName } from "../ui/icons";

/** Controls which settings are visible: "simple" hides power-user sections and expert fields. */
export type SettingsMode = "simple" | "advanced";

/** Section IDs used throughout settings for navigation and conditional logic. */
export const SECTION_IDS = {
  TRACKER: "tracker",
  MODEL_PROVIDER_AUTH: "model-provider-auth",
  SANDBOX: "sandbox",
  AGENT: "agent",
  CODEX_TIMEOUTS: "codex-timeouts",
  WORKSPACE: "workspace",
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
    description: "Configure how Risoluto works",
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

export type SettingsFieldTier = "essential" | "standard" | "expert";

export interface SettingsFieldValidation {
  min?: number;
  max?: number;
  pattern?: RegExp;
  required?: boolean;
  message?: string;
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
  /** The default value from builders/schemas. Shown persistently in hint text. */
  defaultValue?: string;
  /** Disclosure tier: essential (always), standard (below separator), expert (behind toggle). */
  tier?: SettingsFieldTier;
  /** For number fields: unit suffix, e.g. "ms" — triggers human-readable conversion. */
  unit?: string;
  /** Validation rules for the field. */
  validation?: SettingsFieldValidation;
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
  /** When set to "advanced", this section is hidden in Simple mode. */
  mode?: "advanced";
}

export interface SettingsFieldGroup {
  id: string;
  title: string;
  description?: string;
  advanced: boolean;
  /** Resolved disclosure tier for the group (derived from field tiers). */
  tier: SettingsFieldTier;
  fields: SettingsFieldDefinition[];
}
