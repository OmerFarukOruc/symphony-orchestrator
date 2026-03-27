/**
 * Shared settings types and constants, extracted to break the import cycle
 * between settings-helpers.ts, settings-section-defs.ts, and settings-patches.ts.
 */

import type { IconName } from "../ui/icons";

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
