import { createButton, createField } from "../components/forms";
import type { ModalController } from "../components/modal";
import type { SecretsState } from "./secrets-state";

export function renderAddSecretModal(
  modal: ModalController,
  state: SecretsState,
  keyInput: HTMLInputElement,
  valueInput: HTMLTextAreaElement,
  onSave: () => void,
): void {
  keyInput.value = state.draftKey;
  valueInput.value = state.draftValue;
  modal.body.replaceChildren();
  const form = document.createElement("div");
  form.className = "form-grid";
  form.append(createField("Key", keyInput), createField("Value", valueInput, "Value is never returned after save."));
  modal.body.append(form);
  modal.footer.replaceChildren();
  const cancel = createButton("Cancel");
  const save = createButton(state.saving ? "Saving…" : "Save secret", "primary");
  save.disabled = state.saving;
  cancel.addEventListener("click", () => modal.close());
  save.addEventListener("click", onSave);
  modal.footer.append(cancel, save);
}

export function renderDeleteSecretModal(modal: ModalController, state: SecretsState, onDelete: () => void): void {
  modal.body.replaceChildren();
  const confirmInput = Object.assign(document.createElement("input"), {
    className: "mc-input text-mono",
    value: state.deleteConfirm,
    placeholder: state.selectedKey,
  });
  confirmInput.addEventListener("input", () => {
    state.deleteConfirm = confirmInput.value;
    renderDeleteSecretModal(modal, state, onDelete);
  });
  modal.body.append(createField("Confirmation", confirmInput, `Type ${state.selectedKey} exactly to enable deletion.`));
  modal.footer.replaceChildren();
  const cancel = createButton("Cancel");
  const confirm = createButton(state.deleting ? "Deleting…" : "Delete key", "primary");
  confirm.disabled = state.deleting || state.deleteConfirm !== state.selectedKey;
  cancel.addEventListener("click", () => modal.close());
  confirm.addEventListener("click", onDelete);
  modal.footer.append(cancel, confirm);
}
