import { createButton, createField } from "../components/forms";

import type { SettingsFieldDefinition } from "./settings-helpers";

interface SettingsFieldRenderOptions {
  value: string;
  onInput: (value: string) => void;
  onFocus: () => void;
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
    const select = document.createElement("select");
    select.className = "mc-select";
    (field.options ?? []).forEach((option) => {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      select.append(node);
    });
    select.value = options.value;
    select.addEventListener("change", () => options.onInput(select.value));
    select.addEventListener("focus", options.onFocus);
    select.disabled = field.editable === false;
    return select;
  }
  if (field.kind === "boolean") {
    const select = document.createElement("select");
    select.className = "mc-select";
    [
      { value: "true", label: "Enabled" },
      { value: "false", label: "Disabled" },
    ].forEach((option) => {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      select.append(node);
    });
    select.value = options.value || "false";
    select.addEventListener("change", () => options.onInput(select.value));
    select.addEventListener("focus", options.onFocus);
    select.disabled = field.editable === false;
    return select;
  }
  if (field.kind === "textarea" || field.kind === "json" || field.kind === "list") {
    const textarea = document.createElement("textarea");
    textarea.className = "mc-textarea settings-textarea";
    textarea.placeholder = field.placeholder ?? "";
    textarea.value = options.value;
    textarea.readOnly = field.editable === false;
    textarea.addEventListener("input", () => options.onInput(textarea.value));
    textarea.addEventListener("focus", options.onFocus);
    return textarea;
  }
  const input = document.createElement("input");
  input.className = "mc-input";
  input.type = field.kind === "number" ? "number" : "text";
  input.placeholder = field.placeholder ?? "";
  input.value = options.value;
  input.readOnly = field.editable === false;
  input.addEventListener("input", () => options.onInput(input.value));
  input.addEventListener("focus", options.onFocus);
  return input;
}
