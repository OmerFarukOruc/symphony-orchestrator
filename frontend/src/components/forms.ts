export function createField(labelText: string, control: HTMLElement, hint?: string): HTMLElement {
  const field = document.createElement("label");
  field.className = "form-field";

  const label = document.createElement("span");
  label.className = "form-label";
  label.textContent = labelText;
  field.append(label, control);

  if (hint) {
    const detail = document.createElement("span");
    detail.className = "form-hint";
    detail.textContent = hint;
    field.append(detail);
  }

  return field;
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
