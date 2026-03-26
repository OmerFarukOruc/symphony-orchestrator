/* eslint-disable sonarjs/cognitive-complexity */
import type { ChangeEventHandler, ReactElement } from "react";

import styles from "./Settings.module.css";
import {
  hasValueAtPath,
  type SettingsFieldDefinition,
  type SettingsFieldErrors,
  type SettingsSectionDefinition,
} from "./settings-form.js";
import { settingsSections } from "./settings-definitions.js";

type SettingsSectionSummary = SettingsSectionDefinition & Readonly<{ overrideCount: number }>;

type SettingsRailProps = Readonly<{
  sections: readonly SettingsSectionSummary[];
}>;

type SettingsSectionsPanelProps = Readonly<{
  drafts: Record<string, string>;
  fieldErrors: SettingsFieldErrors;
  onFieldChange: (path: string) => ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
  overlay: Record<string, unknown>;
}>;

export function SettingsRail({ sections }: SettingsRailProps): ReactElement {
  return (
    <aside className={styles.rail} aria-label="Settings sections">
      {sections.map((section) => (
        <a className={styles.railLink} href={`#settings-section-${section.id}`} key={section.id}>
          <span className={styles.railTitle}>{section.title}</span>
          <span className={styles.railMeta}>{section.overrideCount} saved override(s)</span>
        </a>
      ))}
    </aside>
  );
}

export function SettingsSectionsPanel({
  drafts,
  fieldErrors,
  onFieldChange,
  overlay,
}: SettingsSectionsPanelProps): ReactElement {
  return (
    <div className={styles.sections} data-testid="settings-form">
      {settingsSections.map((section) => (
        <article className={styles.sectionCard} id={`settings-section-${section.id}`} key={section.id}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{section.title}</h2>
            <p className={styles.sectionDescription}>{section.description}</p>
          </header>

          <div className={styles.fieldGrid}>
            {section.fields.map((field) => (
              <SettingsField
                draftValue={drafts[field.path] ?? ""}
                error={fieldErrors[field.path]}
                field={field}
                hasOverride={hasValueAtPath(overlay, field.path)}
                key={field.path}
                onChange={onFieldChange(field.path)}
              />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function SettingsField({
  draftValue,
  error,
  field,
  hasOverride,
  onChange,
}: Readonly<{
  draftValue: string;
  error?: string;
  field: SettingsFieldDefinition;
  hasOverride: boolean;
  onChange: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
}>): ReactElement {
  const inputId = `settings-field-${field.path.replaceAll(/\W/g, "-")}`;

  return (
    <label className={styles.field} htmlFor={inputId}>
      <span className={styles.fieldTopline}>
        <span className={styles.fieldLabel}>{field.label}</span>
        <span className={hasOverride ? styles.overrideBadge : styles.defaultBadge}>
          {hasOverride ? "Override saved" : "Workflow value"}
        </span>
      </span>
      <span className={styles.fieldDescription}>{field.description}</span>

      {field.kind === "list" ? (
        <textarea
          aria-invalid={error ? true : undefined}
          className={styles.textarea}
          id={inputId}
          onChange={onChange}
          placeholder={field.placeholder}
          rows={4}
          value={draftValue}
        />
      ) : field.kind === "select" ? (
        <select
          aria-invalid={error ? true : undefined}
          className={styles.select}
          id={inputId}
          onChange={onChange}
          value={draftValue}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-invalid={error ? true : undefined}
          className={styles.input}
          id={inputId}
          onChange={onChange}
          placeholder={field.placeholder}
          type={field.kind === "number" ? "number" : "text"}
          value={draftValue}
        />
      )}

      {error ? <span className={styles.fieldError}>{error}</span> : null}
    </label>
  );
}
