const patternCache = new Map<string, RegExp>();
const counterControllers = new WeakMap<HTMLInputElement | HTMLTextAreaElement, AbortController>();

export interface FieldOptions {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
}

export function createField(options: FieldOptions, control: HTMLElement): HTMLElement {
  const field = document.createElement("div");
  field.className = "form-field";

  const label = document.createElement("label");
  label.className = "form-label";
  if (options.required) {
    label.classList.add("required");
  }
  label.textContent = options.label;

  if (options.maxLength && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    control.maxLength = options.maxLength;
  }
  if (options.minLength && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    control.minLength = options.minLength;
  }
  if (options.pattern && control instanceof HTMLInputElement) {
    control.pattern = options.pattern;
  }
  if (
    options.required &&
    (control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement)
  ) {
    control.required = true;
  }

  field.append(label, control);

  if (options.hint) {
    const detail = document.createElement("span");
    detail.className = "form-hint";
    detail.textContent = options.hint;
    field.append(detail);
  }

  if (options.error) {
    const errorEl = document.createElement("span");
    errorEl.className = "form-error";
    errorEl.textContent = options.error;
    errorEl.setAttribute("role", "alert");
    field.append(errorEl);
    control.classList.add("is-invalid");
    if (control instanceof HTMLElement) {
      control.setAttribute("aria-invalid", "true");
      control.setAttribute(
        "aria-describedby",
        errorEl.id || (errorEl.id = `error-${Math.random().toString(36).slice(2)}`),
      );
    }
  }

  return field;
}

export function createInput(options: {
  type?: string;
  placeholder?: string;
  value?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  autocomplete?: AutoFill;
}): HTMLInputElement {
  const input = document.createElement("input");
  input.type = options.type ?? "text";
  input.className = "mc-input";
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.value) input.value = options.value;
  if (options.required) input.required = true;
  if (options.maxLength) input.maxLength = options.maxLength;
  if (options.minLength) input.minLength = options.minLength;
  if (options.pattern) input.pattern = options.pattern;
  if (options.autocomplete) input.autocomplete = options.autocomplete;
  return input;
}

export function createTextarea(options: {
  placeholder?: string;
  value?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  rows?: number;
}): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.className = "mc-textarea";
  if (options.placeholder) textarea.placeholder = options.placeholder;
  if (options.value) textarea.value = options.value;
  if (options.required) textarea.required = true;
  if (options.maxLength) textarea.maxLength = options.maxLength;
  if (options.minLength) textarea.minLength = options.minLength;
  if (options.rows) textarea.rows = options.rows;
  return textarea;
}

export function createSelect(options: {
  options: { value: string; label: string }[];
  value?: string;
  required?: boolean;
}): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = "mc-select";
  if (options.required) select.required = true;

  options.options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (options.value === opt.value) {
      option.selected = true;
    }
    select.append(option);
  });

  return select;
}

export function createCharacterCounter(input: HTMLInputElement | HTMLTextAreaElement, maxLength: number): HTMLElement {
  const counter = document.createElement("span");
  counter.className = "input-counter";

  function update(): void {
    const remaining = maxLength - input.value.length;
    counter.textContent = `${input.value.length} / ${maxLength}`;
    if (remaining < 0) {
      counter.classList.add("is-error");
      counter.classList.remove("is-warning");
    } else if (remaining < maxLength * 0.1) {
      counter.classList.add("is-warning");
      counter.classList.remove("is-error");
    } else {
      counter.classList.remove("is-warning", "is-error");
    }
  }

  const existing = counterControllers.get(input);
  if (existing) existing.abort();
  const ac = new AbortController();
  counterControllers.set(input, ac);
  input.addEventListener("input", update, { signal: ac.signal });
  update();

  return counter;
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

export function validateField(input: HTMLInputElement | HTMLTextAreaElement): { valid: boolean; error?: string } {
  if (input.required && !input.value.trim()) {
    return { valid: false, error: "This field is required" };
  }
  if (input.minLength && input.value.length < input.minLength) {
    return { valid: false, error: `Minimum ${input.minLength} characters required` };
  }
  if (input.maxLength && input.value.length > input.maxLength) {
    return { valid: false, error: `Maximum ${input.maxLength} characters allowed` };
  }
  if (input instanceof HTMLInputElement && input.pattern) {
    let re = patternCache.get(input.pattern);
    if (!re) {
      // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp
      // input.pattern comes from the HTML pattern attribute set by the developer,
      // not from user input. This is a safe source for RegExp construction.
      re = new RegExp(input.pattern);
      patternCache.set(input.pattern, re);
    }
    if (!re.test(input.value)) return { valid: false, error: "Invalid format" };
  }
  return { valid: true };
}
