import {
  applyFieldConstraints,
  createCharacterCounter,
  hasValidationRules,
  isFieldControl,
  isTextEntryControl,
  syncFieldError,
} from "./form-controls.js";

export interface FieldOptions {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

export function createField(options: FieldOptions, control: HTMLElement): HTMLElement {
  const field = document.createElement("div");
  field.className = "form-field";

  const label = document.createElement("label");
  label.className = `form-label${options.required ? " required" : ""}`;
  label.textContent = options.label;

  const describedBy: string[] = [];
  if (isFieldControl(control)) {
    applyFieldConstraints(control, options);
    if (!control.id) {
      control.id = `field-${Math.random().toString(36).slice(2)}`;
    }
    label.htmlFor = control.id;
  }

  field.append(label, control);

  if (options.hint) {
    const hint = document.createElement("span");
    hint.className = "form-hint";
    hint.id = `${control.id || "field"}-hint`;
    hint.textContent = options.hint;
    describedBy.push(hint.id);
    field.append(hint);
  }

  if (isTextEntryControl(control) && options.maxLength) {
    field.append(createCharacterCounter(control, options.maxLength));
  }

  if (isFieldControl(control)) {
    const errorEl = document.createElement("span");
    errorEl.className = "form-error";
    errorEl.id = `${control.id}-error`;
    errorEl.hidden = true;
    errorEl.setAttribute("role", "alert");
    describedBy.push(errorEl.id);
    field.append(errorEl);
    syncFieldError(control, errorEl, options.error);

    if (hasValidationRules(options)) {
      const update = () => syncFieldError(control, errorEl);
      control.addEventListener(control instanceof HTMLSelectElement ? "change" : "input", update);
      control.addEventListener("blur", update);
    }
    control.setAttribute("aria-describedby", describedBy.join(" "));
  }

  return field;
}

export function createTextInput(options: {
  type?: string;
  placeholder?: string;
  value?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  autocomplete?: AutoFill;
  className?: string;
  readOnly?: boolean;
  disabled?: boolean;
}): HTMLInputElement {
  const input = document.createElement("input");
  input.type = options.type ?? "text";
  input.className = options.className ?? "mc-input";
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.value) input.value = options.value;
  if (options.required) input.required = true;
  if (options.maxLength) input.maxLength = options.maxLength;
  if (options.minLength) input.minLength = options.minLength;
  if (options.pattern) input.pattern = options.pattern;
  if (options.autocomplete) input.autocomplete = options.autocomplete;
  input.readOnly = options.readOnly ?? false;
  input.disabled = options.disabled ?? false;
  return input;
}

export function createTextareaControl(options: {
  placeholder?: string;
  value?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  rows?: number;
  className?: string;
  readOnly?: boolean;
  disabled?: boolean;
}): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.className = options.className ?? "mc-textarea";
  if (options.placeholder) textarea.placeholder = options.placeholder;
  if (options.value) textarea.value = options.value;
  if (options.required) textarea.required = true;
  if (options.maxLength) textarea.maxLength = options.maxLength;
  if (options.minLength) textarea.minLength = options.minLength;
  if (options.rows) textarea.rows = options.rows;
  textarea.readOnly = options.readOnly ?? false;
  textarea.disabled = options.disabled ?? false;
  return textarea;
}

export function createSelectControl(options: {
  options: SelectOption[];
  value?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
}): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = options.className ?? "mc-select";
  select.required = options.required ?? false;
  select.disabled = options.disabled ?? false;
  options.options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    option.selected = options.value === opt.value;
    select.append(option);
  });
  return select;
}

export function createButton(
  label: string,
  variant = "ghost",
  type: "button" | "submit" = "button",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = type;
  button.className = `mc-button ${variant === "primary" ? "mc-button-ghost is-primary" : "mc-button-ghost"}`;
  button.textContent = label;
  return button;
}
