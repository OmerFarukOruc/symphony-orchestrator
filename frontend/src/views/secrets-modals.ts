import { createField, createTextInput, createTextareaControl } from "../components/forms";
import { openConfirmModal } from "../ui/confirm-modal.js";
import type { SecretsState } from "./secrets-state";

interface SecretDraft {
  key: string;
  value: string;
}

interface AddSecretModalOptions {
  state: SecretsState;
  onClose?: () => void;
  onSave: (draft: SecretDraft) => boolean | Promise<boolean>;
}

interface DeleteSecretModalOptions {
  state: SecretsState;
  onClose?: () => void;
  onDelete: () => boolean | Promise<boolean>;
}

export function openAddSecretModal(options: AddSecretModalOptions): () => void {
  const keyInput = createTextInput({
    className: "mc-input text-mono",
    placeholder: "LINEAR_API_KEY",
    value: options.state.draftKey,
    required: true,
  });
  const valueInput = createTextareaControl({
    className: "mc-textarea secrets-value",
    placeholder: "Paste the secret value",
    value: options.state.draftValue,
    required: true,
  });

  keyInput.addEventListener("input", () => {
    options.state.draftKey = keyInput.value;
  });
  valueInput.addEventListener("input", () => {
    options.state.draftValue = valueInput.value;
  });

  const form = document.createElement("div");
  form.className = "form-grid";
  form.append(
    createField({ label: "Key", required: true }, keyInput),
    createField({ label: "Value", hint: "Value is never returned after save.", required: true }, valueInput),
  );

  return openConfirmModal({
    title: "Add secret",
    body: form,
    cancelLabel: "Cancel",
    confirmLabel: "Save secret",
    pendingLabel: "Saving…",
    variant: "primary",
    onClose: options.onClose,
    onConfirm: () =>
      options.onSave({
        key: keyInput.value.trim(),
        value: valueInput.value,
      }),
  });
}

export function openDeleteSecretModal(options: DeleteSecretModalOptions): () => void {
  let setConfirmDisabled: ((disabled: boolean) => void) | null = null;
  const confirmInput = createTextInput({
    className: "mc-input text-mono",
    value: options.state.deleteConfirm,
    placeholder: options.state.selectedKey,
    required: true,
  });
  const field = createField(
    {
      label: "Confirmation",
      hint: `Type ${options.state.selectedKey} exactly to enable deletion.`,
      required: true,
    },
    confirmInput,
  );

  confirmInput.addEventListener("input", () => {
    options.state.deleteConfirm = confirmInput.value;
    setConfirmDisabled?.(options.state.deleteConfirm !== options.state.selectedKey);
  });

  return openConfirmModal({
    title: "Delete secret",
    body: field,
    cancelLabel: "Cancel",
    confirmLabel: "Delete key",
    pendingLabel: "Deleting…",
    variant: "danger",
    onClose: options.onClose,
    onConfirm: options.onDelete,
    onOpen: ({ setConfirmDisabled: fn }) => {
      setConfirmDisabled = fn;
      setConfirmDisabled(options.state.deleteConfirm !== options.state.selectedKey);
    },
  });
}
