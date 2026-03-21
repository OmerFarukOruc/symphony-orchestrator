const patternCache = new Map<string, RegExp>();
const counterControllers = new WeakMap<HTMLInputElement | HTMLTextAreaElement, AbortController>();

export type FieldControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export function applyFieldConstraints(
  control: FieldControl,
  options: { required?: boolean; maxLength?: number; minLength?: number; pattern?: string },
): void {
  if (options.required) control.required = true;
  if (isTextEntryControl(control) && options.maxLength) control.maxLength = options.maxLength;
  if (isTextEntryControl(control) && options.minLength) control.minLength = options.minLength;
  if (control instanceof HTMLInputElement && options.pattern) control.pattern = options.pattern;
}

export function hasValidationRules(options: {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}): boolean {
  return Boolean(options.required || options.minLength || options.maxLength || options.pattern);
}

export function syncFieldError(control: FieldControl, errorEl: HTMLElement, message?: string): void {
  const nextMessage = message ?? validateField(control).error;
  errorEl.hidden = !nextMessage;
  errorEl.textContent = nextMessage ?? "";
  control.classList.toggle("is-invalid", Boolean(nextMessage));
  control.setAttribute("aria-invalid", nextMessage ? "true" : "false");
}

export function createCharacterCounter(input: HTMLInputElement | HTMLTextAreaElement, maxLength: number): HTMLElement {
  const counter = document.createElement("span");
  counter.className = "input-counter";
  const update = () => {
    const remaining = maxLength - input.value.length;
    counter.textContent = `${input.value.length} / ${maxLength}`;
    counter.classList.toggle("is-warning", remaining >= 0 && remaining < maxLength * 0.1);
    counter.classList.toggle("is-error", remaining < 0);
  };
  counterControllers.get(input)?.abort();
  const ac = new AbortController();
  counterControllers.set(input, ac);
  input.addEventListener("input", update, { signal: ac.signal });
  update();
  return counter;
}

export function isFieldControl(control: HTMLElement): control is FieldControl {
  return isTextEntryControl(control) || control instanceof HTMLSelectElement;
}

export function isTextEntryControl(
  control: HTMLElement | FieldControl,
): control is HTMLInputElement | HTMLTextAreaElement {
  return control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement;
}

function validateField(control: FieldControl): { valid: boolean; error?: string } {
  if (control.required && !control.value.trim()) return { valid: false, error: "This field is required" };
  if (isTextEntryControl(control) && control.minLength > 0 && control.value.length < control.minLength) {
    return { valid: false, error: `Minimum ${control.minLength} characters required` };
  }
  if (isTextEntryControl(control) && control.maxLength > 0 && control.value.length > control.maxLength) {
    return { valid: false, error: `Maximum ${control.maxLength} characters allowed` };
  }
  if (control instanceof HTMLInputElement && control.pattern) {
    let re = patternCache.get(control.pattern);
    if (!re) {
      re = new RegExp(control.pattern);
      patternCache.set(control.pattern, re);
    }
    if (!re.test(control.value)) return { valid: false, error: "Invalid format" };
  }
  return { valid: true };
}
