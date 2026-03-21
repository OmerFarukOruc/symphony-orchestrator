import { api } from "../api";
import { createButton } from "../components/forms";
import { createPageHeader } from "../components/page-header";
import { toast } from "../ui/toast";
import { isTypingTarget } from "../utils/dom.js";
import { registerPageCleanup } from "../utils/page";
import { handleSecretsKeyboard } from "./secrets-keyboard";
import { openAddSecretModal, openDeleteSecretModal } from "./secrets-modals";
import { createSecretsState } from "./secrets-state";
import { renderSecretsTable } from "./secrets-table";

export function createSecretsPage(): HTMLElement {
  const state = createSecretsState();
  const page = document.createElement("div");
  page.className = "page secrets-page fade-in";
  const addButton = createButton("New secret", "primary");
  const header = createPageHeader(
    "Credentials",
    "Store API keys and tokens securely. Values are encrypted and never shown after saving.",
    { actions: addButton },
  );
  // Help callout
  const helpCallout = document.createElement("section");
  helpCallout.className = "secrets-help-callout mc-panel";
  helpCallout.innerHTML = `
    <h2>What credentials should I store?</h2>
    <ul>
      <li><code>LINEAR_API_KEY</code> — Your Linear API token for issue tracking</li>
      <li><code>OPENAI_API_KEY</code> — OpenAI API key for Codex/LLM access</li>
      <li><code>ANTHROPIC_API_KEY</code> — Anthropic API key (if using Claude)</li>
      <li><code>GITHUB_TOKEN</code> — GitHub personal access token for repo operations</li>
    </ul>
    <p class="text-secondary">These secrets are passed to sandboxed containers when processing issues. Add any key your workflow needs.</p>
  `;
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
  page.append(header, helpCallout, body);
  let closeAddModal: (() => void) | null = null;
  let closeDeleteModal: (() => void) | null = null;

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

  async function saveSecret(draft: { key: string; value: string }): Promise<boolean> {
    state.draftKey = draft.key;
    state.draftValue = draft.value;
    if (!draft.key || !draft.value) {
      toast("Key and value are required.", "error");
      return false;
    }
    try {
      await api.postSecret(draft.key, draft.value);
      toast(`Secret ${draft.key} saved.`, "success");
      state.draftKey = "";
      state.draftValue = "";
      await load();
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to save secret.", "error");
      return false;
    }
  }

  async function deleteSecret(): Promise<boolean> {
    try {
      await api.deleteSecret(state.selectedKey);
      toast(`Secret ${state.selectedKey} deleted.`, "success");
      state.deleteConfirm = "";
      await load();
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to delete secret.", "error");
      return false;
    }
  }

  function openAddModal(): void {
    closeAddModal?.();
    closeAddModal = openAddSecretModal({
      state,
      onClose: () => {
        closeAddModal = null;
      },
      onSave: saveSecret,
    });
  }

  function openDeleteModal(): void {
    closeDeleteModal?.();
    closeDeleteModal = openDeleteSecretModal({
      state,
      onClose: () => {
        closeDeleteModal = null;
      },
      onDelete: deleteSecret,
    });
  }

  function render(): void {
    renderSecretsTable(tableWrap, state.keys, state.selectedKey, {
      onAdd: openAddModal,
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
        openDeleteModal();
      },
    });
    if (state.error) {
      trust.querySelector("p")!.textContent = state.error;
    } else {
      trust.querySelector("p")!.textContent = trustCopy;
    }
  }

  addButton.addEventListener("click", openAddModal);

  function onKey(event: KeyboardEvent): void {
    const isTyping = isTypingTarget(event.target);
    handleSecretsKeyboard(event, {
      selectedKey: state.selectedKey,
      addOpen: closeAddModal !== null,
      deleteOpen: closeDeleteModal !== null,
      isTyping,
      onNew: openAddModal,
      onDelete: () => {
        state.deleteConfirm = "";
        openDeleteModal();
      },
      onClose: () => {
        closeAddModal?.();
        closeDeleteModal?.();
      },
    });
  }

  window.addEventListener("keydown", onKey);
  void load();
  registerPageCleanup(page, () => {
    closeAddModal?.();
    closeDeleteModal?.();
    window.removeEventListener("keydown", onKey);
  });
  return page;
}
