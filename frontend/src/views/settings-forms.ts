import {
  createButton,
  createField,
  createSelectControl,
  createTextInput,
  createTextareaControl,
} from "../components/forms";

import type { SettingsFieldDefinition } from "./settings-helpers";

interface SettingsFieldRenderOptions {
  value: string;
  onInput: (value: string) => void;
  onFocus: () => void;
  onAction?: () => void;
}

export function createSettingsField(field: SettingsFieldDefinition, options: SettingsFieldRenderOptions): HTMLElement {
  const control = buildControl(field, options);
  return createField({ label: field.label, hint: field.hint }, control);
}

export function createSectionAction(label: string, primary = false): HTMLButtonElement {
  return createButton(label, primary ? "primary" : "ghost");
}

function buildControl(field: SettingsFieldDefinition, options: SettingsFieldRenderOptions): HTMLElement {
  if (field.kind === "select") {
    const select = createSelectControl({
      options: field.options ?? [],
      value: options.value,
      disabled: field.editable === false,
    });
    select.addEventListener("change", () => options.onInput(select.value));
    select.addEventListener("focus", options.onFocus);
    return select;
  }
  if (field.kind === "boolean") {
    const select = createSelectControl({
      options: [
        { value: "true", label: "Enabled" },
        { value: "false", label: "Disabled" },
      ],
      value: options.value || "false",
      disabled: field.editable === false,
    });
    select.addEventListener("change", () => options.onInput(select.value));
    select.addEventListener("focus", options.onFocus);
    return select;
  }
  if (field.kind === "textarea" || field.kind === "json" || field.kind === "list") {
    const textarea = createTextareaControl({
      className: "mc-textarea settings-textarea",
      placeholder: field.placeholder ?? "",
      value: options.value,
      readOnly: field.editable === false,
    });
    textarea.addEventListener("input", () => options.onInput(textarea.value));
    textarea.addEventListener("focus", options.onFocus);
    return textarea;
  }
  const input = createTextInput({
    className: "mc-input",
    type: field.kind === "number" ? "number" : "text",
    placeholder: field.placeholder ?? "",
    value: options.value,
    readOnly: field.editable === false,
  });
  input.addEventListener("input", () => options.onInput(input.value));
  input.addEventListener("focus", options.onFocus);

  if (field.actionLabel && options.onAction) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:var(--space-2);align-items:center;";
    const btn = createButton(field.actionLabel, "ghost");
    btn.addEventListener("click", options.onAction);
    row.append(input, btn);
    input.style.flex = "1";
    return row;
  }

  return input;
}
