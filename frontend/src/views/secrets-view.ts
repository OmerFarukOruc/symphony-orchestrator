import { api } from "../api";
import { createButton } from "../components/forms";
import { createModal } from "../components/modal";
import { toast } from "../ui/toast";
import { registerPageCleanup } from "../utils/page";
import { handleSecretsKeyboard } from "./secrets-keyboard";
import { renderAddSecretModal, renderDeleteSecretModal } from "./secrets-modals";
import { createSecretsState } from "./secrets-state";
import { renderSecretsTable } from "./secrets-table";

export function createSecretsPage(): HTMLElement {
  const state = createSecretsState();
  const page = document.createElement("div");
  page.className = "page secrets-page fade-in";
  const header = document.createElement("section");
  header.className = "mc-strip";
  header.innerHTML = `<div><h1 class="page-title">Secrets</h1><p class="page-subtitle">Trust-first secret management. Values are written once, encrypted at rest, and never shown back to the operator.</p></div>`;
  const addButton = createButton("New secret", "primary");
  header.append(addButton);
  const body = document.createElement("section");
  body.className = "secrets-layout";
  const tableWrap = document.createElement("div");
  tableWrap.className = "secrets-table-wrap";
  body.append(tableWrap);
  const trust = document.createElement("aside");
  trust.className = "mc-panel secrets-trust";
  const trustCopy =
    "Symphony stores only secret keys in the UI. Values remain write-only, encrypted at rest, and redacted from subsequent reads.";
  trust.innerHTML = `<h2>Encryption boundary</h2><p class="text-secondary">${trustCopy}</p>`;
  body.append(trust);
  const addModal = createModal({
    title: "Add secret",
    description: "Values are entered once and cannot be recovered later.",
  });
  const deleteModal = createModal({ title: "Delete secret", description: "Type the key name to confirm destruction." });
  page.append(header, body, addModal.root, deleteModal.root);

  const keyInput = Object.assign(document.createElement("input"), {
    className: "mc-input text-mono",
    placeholder: "LINEAR_API_KEY",
  });
  const valueInput = Object.assign(document.createElement("textarea"), {
    className: "mc-textarea secrets-value",
    placeholder: "Paste the secret value",
  });

  async function load(): Promise<void> {
    state.loading = true;
    render();
    try {
      const response = await api.getSecrets();
      state.keys = response.keys;
      state.selectedKey = state.selectedKey || response.keys[0] || "";
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Failed to load secrets.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function saveSecret(): Promise<void> {
    state.draftKey = keyInput.value.trim();
    state.draftValue = valueInput.value;
    if (!state.draftKey || !state.draftValue) {
      toast("Key and value are required.", "error");
      return;
    }
    state.saving = true;
    renderAddSecretModal(addModal, state, keyInput, valueInput, () => void saveSecret());
    try {
      await api.postSecret(state.draftKey, state.draftValue);
      toast(`Secret ${state.draftKey} saved.`, "success");
      state.draftKey = "";
      state.draftValue = "";
      addModal.close();
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to save secret.", "error");
    } finally {
      state.saving = false;
      renderAddSecretModal(addModal, state, keyInput, valueInput, () => void saveSecret());
    }
  }

  async function deleteSecret(): Promise<void> {
    state.deleting = true;
    renderDeleteSecretModal(deleteModal, state, () => void deleteSecret());
    try {
      await api.deleteSecret(state.selectedKey);
      toast(`Secret ${state.selectedKey} deleted.`, "success");
      state.deleteConfirm = "";
      deleteModal.close();
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to delete secret.", "error");
    } finally {
      state.deleting = false;
      renderDeleteSecretModal(deleteModal, state, () => void deleteSecret());
    }
  }

  function render(): void {
    renderSecretsTable(tableWrap, state.keys, state.selectedKey, {
      onSelect: (key) => {
        state.selectedKey = key;
      },
      onCopy: async (key) => {
        await navigator.clipboard.writeText(key);
        toast(`Copied ${key}.`, "success");
      },
      onDelete: (key) => {
        state.selectedKey = key;
        state.deleteConfirm = "";
        renderDeleteSecretModal(deleteModal, state, () => void deleteSecret());
        deleteModal.open();
      },
    });
    renderAddSecretModal(addModal, state, keyInput, valueInput, () => void saveSecret());
    if (state.error) {
      trust.querySelector("p")!.textContent = state.error;
    } else {
      trust.querySelector("p")!.textContent = trustCopy;
    }
  }

  addButton.addEventListener("click", () => {
    renderAddSecretModal(addModal, state, keyInput, valueInput, () => void saveSecret());
    addModal.open();
  });

  function onKey(event: KeyboardEvent): void {
    const isTyping = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    handleSecretsKeyboard(event, {
      selectedKey: state.selectedKey,
      addOpen: addModal.isOpen(),
      deleteOpen: deleteModal.isOpen(),
      isTyping,
      onNew: () => {
        renderAddSecretModal(addModal, state, keyInput, valueInput, () => void saveSecret());
        addModal.open();
      },
      onDelete: () => {
        state.deleteConfirm = "";
        renderDeleteSecretModal(deleteModal, state, () => void deleteSecret());
        deleteModal.open();
      },
      onClose: () => {
        if (addModal.isOpen()) addModal.close();
        if (deleteModal.isOpen()) deleteModal.close();
      },
    });
  }

  window.addEventListener("keydown", onKey);
  void load();
  registerPageCleanup(page, () => {
    addModal.destroy();
    deleteModal.destroy();
    window.removeEventListener("keydown", onKey);
  });
  return page;
}
