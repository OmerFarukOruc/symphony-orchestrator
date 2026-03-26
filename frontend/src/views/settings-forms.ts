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
  hintId?: string;
  onInput: (value: string) => void;
  onFocus: () => void;
  onAction?: () => void;
}

export function createSettingsField(field: SettingsFieldDefinition, options: SettingsFieldRenderOptions): HTMLElement {
  const control = buildControl(field, options);
  const wrapper = createField({ label: field.label, hint: field.hint }, control);
  wrapper.dataset.fieldKind = field.kind;

  if (options.hintId) {
    const hintEl = wrapper.querySelector(".form-hint");
    const oldHintId = hintEl?.id;
    if (hintEl) {
      hintEl.id = options.hintId;
    }
    const fieldControl = wrapper.querySelector("input, textarea, select");
    if (fieldControl) {
      const existing = fieldControl.getAttribute("aria-describedby") ?? "";
      const ids = existing ? existing.split(" ").filter((id) => id !== oldHintId) : [];
      ids.unshift(options.hintId);
      fieldControl.setAttribute("aria-describedby", ids.join(" "));
    }
  }

  return wrapper;
}

export function createSectionAction(label: string, primary = false): HTMLButtonElement {
  return createButton(label, primary ? "primary" : "ghost");
}

function buildCredentialControl(): HTMLElement {
  const container = document.createElement("div");
  container.className = "settings-credential-list";

  const loading = document.createElement("p");
  loading.className = "text-secondary";
  loading.textContent = "Loading credentials\u2026";
  container.append(loading);

  void (async () => {
    const { api } = await import("../api.js");

    async function refresh(): Promise<void> {
      try {
        const { keys } = await api.getSecrets();
        container.replaceChildren();

        if (keys.length === 0) {
          const empty = document.createElement("p");
          empty.className = "text-secondary";
          empty.textContent = "No credentials stored yet.";
          container.append(empty);
        } else {
          const pills = document.createElement("div");
          pills.className = "settings-credential-pills";
          for (const key of keys) {
            const pill = document.createElement("span");
            pill.className = "settings-credential-pill";
            const name = document.createElement("span");
            name.textContent = key;
            const del = document.createElement("button");
            del.type = "button";
            del.className = "settings-credential-delete";
            del.textContent = "\u00d7";
            del.setAttribute("aria-label", `Delete ${key}`);
            del.addEventListener("click", async () => {
              if (confirm(`Delete credential "${key}"? This cannot be undone.`)) {
                await api.deleteSecret(key);
                await refresh();
              }
            });
            pill.append(name, del);
            pills.append(pill);
          }
          container.append(pills);
        }

        const addBtn = createButton("+ Add credential", "ghost");
        addBtn.addEventListener("click", async () => {
          const key = prompt("Credential key name (e.g. LINEAR_API_KEY):");
          if (!key?.trim()) return;
          const value = prompt(`Value for ${key}:`);
          if (!value?.trim()) return;
          await api.postSecret(key.trim(), value.trim());
          await refresh();
        });
        container.append(addBtn);

        const trust = document.createElement("p");
        trust.className = "settings-credential-trust text-secondary";
        trust.textContent = "Encrypted at rest. Values are write-only after save.";
        container.append(trust);
      } catch {
        container.replaceChildren();
        const err = document.createElement("p");
        err.className = "form-error";
        err.textContent = "Failed to load credentials.";
        container.append(err);
      }
    }

    await refresh();
  })();

  return container;
}

function buildControl(field: SettingsFieldDefinition, options: SettingsFieldRenderOptions): HTMLElement {
  if (field.kind === "credential") {
    return buildCredentialControl();
  }
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

    if (field.kind === "json") {
      const errorEl = createInlineError();
      textarea.addEventListener("blur", () => {
        const val = textarea.value.trim();
        if (val === "") {
          textarea.classList.remove("settings-field-error");
          errorEl.hidden = true;
          return;
        }
        try {
          JSON.parse(val);
          textarea.classList.remove("settings-field-error");
          errorEl.hidden = true;
        } catch (error_) {
          textarea.classList.add("settings-field-error");
          errorEl.textContent = `Invalid JSON: ${error_ instanceof SyntaxError ? error_.message : "parse error"}`;
          errorEl.hidden = false;
        }
      });
      textarea.addEventListener("input", () => {
        textarea.classList.remove("settings-field-error");
        errorEl.hidden = true;
      });
      const group = document.createElement("div");
      group.append(textarea, errorEl);
      return group;
    }

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

  if (field.kind === "number") {
    const errorEl = createInlineError();
    input.addEventListener("blur", () => {
      const val = input.value.trim();
      if (val !== "" && !Number.isFinite(Number(val))) {
        input.classList.add("settings-field-error");
        errorEl.textContent = "Must be a valid number.";
        errorEl.hidden = false;
      } else {
        input.classList.remove("settings-field-error");
        errorEl.hidden = true;
      }
    });
    input.addEventListener("input", () => {
      input.classList.remove("settings-field-error");
      errorEl.hidden = true;
    });

    if (field.actionLabel && options.onAction) {
      const row = document.createElement("div");
      row.className = "settings-field-action-row";
      const btn = createButton(field.actionLabel, "ghost");
      btn.addEventListener("click", options.onAction);
      row.append(input, btn, errorEl);
      return row;
    }

    const group = document.createElement("div");
    group.append(input, errorEl);
    return group;
  }

  if (field.actionLabel && options.onAction) {
    const row = document.createElement("div");
    row.className = "settings-field-action-row";
    const btn = createButton(field.actionLabel, "ghost");
    btn.addEventListener("click", options.onAction);
    row.append(input, btn);
    return row;
  }

  return input;
}

function createInlineError(): HTMLParagraphElement {
  const errorEl = document.createElement("p");
  errorEl.className = "settings-field-error-text";
  errorEl.hidden = true;
  return errorEl;
}
