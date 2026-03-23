import { buildTitleWithBadge } from "./setup-shared";

export type OpenaiAuthMode = "api_key" | "codex_login";
export type DeviceAuthStatus = "idle" | "starting" | "pending" | "complete" | "expired";

export interface OpenaiSetupStepState {
  loading: boolean;
  error: string | null;
  openaiKeyInput: string;
  authMode: OpenaiAuthMode;
  authJsonInput: string;
  showManualAuthFallback: boolean;
  deviceAuthStatus: DeviceAuthStatus;
  deviceAuthUserCode: string;
  deviceAuthVerificationUri: string;
  deviceAuthIntervalSeconds: number;
  deviceAuthExpiresAt: number | null;
  deviceAuthError: string | null;
}

export interface OpenaiSetupStepActions {
  onSelectAuthMode: (mode: OpenaiAuthMode) => void;
  onOpenaiKeyInput: (value: string) => void;
  onAuthJsonInput: (value: string) => void;
  onStartDeviceAuth: () => void;
  onToggleManualAuthFallback: () => void;
  onAdvance: () => void;
  onSkip: () => void;
}

export function buildOpenaiKeyStep(state: OpenaiSetupStepState, actions: OpenaiSetupStepActions): HTMLElement {
  const el = document.createElement("div");

  const titleRow = buildTitleWithBadge("Connect to OpenAI", "is-required", "Required");

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.textContent = "Choose how Codex agents authenticate with OpenAI.";

  const modeWrap = document.createElement("div");
  modeWrap.className = "setup-auth-grid";

  const apiKeyCard = document.createElement("div");
  apiKeyCard.className = `setup-auth-card${state.authMode === "api_key" ? " is-selected" : ""}`;
  apiKeyCard.innerHTML =
    '<div class="setup-auth-card-title">API Key</div>' +
    '<div class="setup-auth-card-desc">Paste an OpenAI API key directly. Best for pay-as-you-go accounts.</div>';
  apiKeyCard.addEventListener("click", () => actions.onSelectAuthMode("api_key"));

  const loginCard = document.createElement("div");
  loginCard.className = `setup-auth-card${state.authMode === "codex_login" ? " is-selected" : ""}`;
  loginCard.innerHTML =
    '<div class="setup-auth-card-title">Codex Login</div>' +
    '<div class="setup-auth-card-desc">Sign in with the browser-based OpenAI device flow. Best for OpenAI-authenticated accounts.</div>';
  loginCard.addEventListener("click", () => actions.onSelectAuthMode("codex_login"));

  modeWrap.append(apiKeyCard, loginCard);
  el.append(titleRow, sub, modeWrap);

  const actionsRow = document.createElement("div");
  actionsRow.className = "setup-actions";

  const skip = document.createElement("button");
  skip.className = "mc-button is-ghost is-sm";
  skip.textContent = "Skip for now";
  skip.addEventListener("click", actions.onSkip);

  const saveBtn = document.createElement("button");
  saveBtn.className = "mc-button is-primary";
  saveBtn.textContent = state.loading ? "Saving…" : "Validate & Save";

  const updateSaveButton = (): void => {
    const hasInput = state.authMode === "api_key" ? !!state.openaiKeyInput : !!state.authJsonInput;
    saveBtn.disabled = state.loading || !hasInput;
  };

  updateSaveButton();
  saveBtn.addEventListener("click", actions.onAdvance);

  if (state.authMode === "api_key") {
    el.append(buildApiKeyField(state, actions, updateSaveButton));
  }

  if (state.authMode === "codex_login") {
    el.append(buildCodexLoginFields(state, actions, updateSaveButton));
  }

  if (state.error) {
    const err = document.createElement("div");
    err.className = "setup-error";
    err.textContent = state.error;
    el.append(err);
  }

  actionsRow.append(skip, saveBtn);
  el.append(actionsRow);

  return el;
}

function buildApiKeyField(
  state: OpenaiSetupStepState,
  actions: OpenaiSetupStepActions,
  updateSaveButton: () => void,
): HTMLElement {
  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.innerHTML =
    'OpenAI API Key &middot; <a class="setup-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">Get one →</a>';

  const input = document.createElement("input");
  input.className = "setup-input";
  input.type = "password";
  input.placeholder = "sk-…";
  input.value = state.openaiKeyInput;
  input.addEventListener("input", () => {
    state.openaiKeyInput = input.value;
    actions.onOpenaiKeyInput(input.value);
    updateSaveButton();
  });

  field.append(label, input);
  return field;
}

function buildCodexLoginFields(
  state: OpenaiSetupStepState,
  actions: OpenaiSetupStepActions,
  updateSaveButton: () => void,
): HTMLElement {
  const wrap = document.createElement("div");

  const instructions = document.createElement("div");
  instructions.className = "setup-callout";
  instructions.innerHTML =
    '<div style="margin-bottom:var(--space-3)">' +
    '<strong style="color:var(--text-accent)">Prerequisite</strong>' +
    '<div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-1);line-height:1.6">' +
    "Before starting device auth, enable <strong>device code authorization for Codex</strong> in " +
    '<a class="setup-link" href="https://chatgpt.com/#settings/Security" target="_blank" rel="noopener">ChatGPT Settings → Security</a>.' +
    "</div>" +
    "</div>" +
    '<div style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.7">' +
    "Symphony can now start the device flow for you directly in the browser. Use the manual <code>auth.json</code> paste only as a fallback." +
    "</div>";

  wrap.append(
    instructions,
    buildDeviceAuthPanel(state, actions),
    buildManualFallback(state, actions, updateSaveButton),
  );
  return wrap;
}

function buildDeviceAuthPanel(state: OpenaiSetupStepState, actions: OpenaiSetupStepActions): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "setup-device-auth-panel";

  const header = document.createElement("div");
  header.className = "setup-device-auth-header";

  const title = document.createElement("div");
  title.className = "setup-label";
  title.style.marginBottom = "0";
  title.textContent = "Browser device auth";

  const desc = document.createElement("div");
  desc.className = "setup-device-auth-copy";
  desc.textContent =
    "Start the OpenAI device flow here, approve access on the verification page, and Symphony will continue automatically.";

  header.append(title, desc);

  const actionRow = document.createElement("div");
  actionRow.className = "setup-device-auth-actions";

  const startBtn = document.createElement("button");
  startBtn.className = "mc-button is-primary is-sm";
  startBtn.textContent = getDeviceAuthButtonLabel(state.deviceAuthStatus);
  startBtn.disabled = state.loading || state.deviceAuthStatus === "starting";
  startBtn.addEventListener("click", actions.onStartDeviceAuth);
  actionRow.append(startBtn);

  if (state.deviceAuthVerificationUri) {
    const openLink = document.createElement("a");
    openLink.className = "mc-button is-ghost is-sm";
    openLink.href = state.deviceAuthVerificationUri;
    openLink.target = "_blank";
    openLink.rel = "noopener";
    openLink.textContent = "Open verification page";
    actionRow.append(openLink);
  }

  panel.append(header, actionRow);

  if (state.deviceAuthStatus !== "idle") {
    panel.append(buildDeviceAuthStatus(state));
  }

  return panel;
}

function buildDeviceAuthStatus(state: OpenaiSetupStepState): HTMLElement {
  const statusWrap = document.createElement("div");
  statusWrap.className = "setup-device-auth-status";

  const statusRow = document.createElement("div");
  statusRow.className = "setup-device-auth-status-row";

  const badge = document.createElement("span");
  badge.className = `setup-device-auth-badge is-${state.deviceAuthStatus}`;
  badge.textContent = state.deviceAuthStatus;

  const message = document.createElement("div");
  message.className = "setup-device-auth-copy";
  message.textContent = getDeviceAuthStatusMessage(state);
  statusRow.append(badge, message);
  statusWrap.append(statusRow);

  if (state.deviceAuthUserCode || state.deviceAuthVerificationUri) {
    const grid = document.createElement("div");
    grid.className = "setup-device-auth-grid";

    if (state.deviceAuthUserCode) {
      grid.append(buildDeviceAuthValueCard("User code", state.deviceAuthUserCode, true));
    }
    if (state.deviceAuthVerificationUri) {
      grid.append(buildDeviceAuthLinkCard(state.deviceAuthVerificationUri));
    }

    statusWrap.append(grid);
  }

  return statusWrap;
}

function buildDeviceAuthValueCard(labelText: string, value: string, mono = false): HTMLElement {
  const card = document.createElement("div");
  card.className = "setup-device-auth-card";

  const label = document.createElement("div");
  label.className = "setup-device-auth-card-label";
  label.textContent = labelText;

  const valueRow = document.createElement("div");
  valueRow.className = "setup-device-auth-card-row";

  const valueEl = document.createElement("div");
  valueEl.className = `setup-device-auth-card-value${mono ? " is-mono" : ""}`;
  valueEl.textContent = value;

  const copyBtn = document.createElement("button");
  copyBtn.className = "mc-button is-ghost is-sm";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(value).catch(() => {});
    copyBtn.textContent = "Copied";
    window.setTimeout(() => {
      copyBtn.textContent = "Copy";
    }, 1500);
  });

  valueRow.append(valueEl, copyBtn);
  card.append(label, valueRow);
  return card;
}

function buildDeviceAuthLinkCard(verificationUri: string): HTMLElement {
  const card = document.createElement("div");
  card.className = "setup-device-auth-card";

  const label = document.createElement("div");
  label.className = "setup-device-auth-card-label";
  label.textContent = "Verification URL";

  const link = document.createElement("a");
  link.className = "setup-link setup-device-auth-link";
  link.href = verificationUri;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = verificationUri;

  card.append(label, link);
  return card;
}

function buildManualFallback(
  state: OpenaiSetupStepState,
  actions: OpenaiSetupStepActions,
  updateSaveButton: () => void,
): HTMLElement {
  const wrap = document.createElement("section");
  wrap.className = "setup-manual-auth";

  const header = document.createElement("div");
  header.className = "setup-manual-auth-header";

  const title = document.createElement("div");
  title.className = "setup-label";
  title.style.marginBottom = "0";
  title.textContent = "Fallback: paste auth.json manually";

  const toggle = document.createElement("button");
  toggle.className = "mc-button is-ghost is-sm";
  toggle.textContent = state.showManualAuthFallback ? "Hide fallback" : "Use auth.json instead";
  toggle.addEventListener("click", () => {
    actions.onToggleManualAuthFallback();
    updateSaveButton();
  });

  header.append(title, toggle);
  wrap.append(header);

  if (!state.showManualAuthFallback) {
    const hint = document.createElement("div");
    hint.className = "setup-device-auth-copy";
    hint.textContent = "Only needed if device auth fails or if you already have an auth.json file to reuse.";
    wrap.append(hint);
    return wrap;
  }

  const steps = document.createElement("div");
  steps.className = "setup-device-auth-copy";
  steps.innerHTML =
    "1. Run <code>codex login --device-auth</code> in a terminal if needed.<br>" +
    "2. Finish the authorization flow on OpenAI.<br>" +
    "3. Paste <code>~/.codex/auth.json</code> below or upload the file.";

  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.textContent = "auth.json contents";

  const textarea = document.createElement("textarea");
  textarea.className = "setup-input";
  textarea.style.cssText = "min-height:100px;font-family:var(--font-mono);font-size:var(--text-xs);resize:vertical";
  textarea.placeholder = '{"access_token":"...","refresh_token":"...","...":"..."}';
  textarea.value = state.authJsonInput;
  textarea.addEventListener("input", () => {
    state.authJsonInput = textarea.value;
    actions.onAuthJsonInput(textarea.value);
    updateSaveButton();
  });

  const uploadRow = document.createElement("div");
  uploadRow.className = "setup-upload-row";

  const uploadBtn = document.createElement("button");
  uploadBtn.className = "mc-button is-ghost is-sm";
  uploadBtn.textContent = "Upload auth.json";
  uploadBtn.addEventListener("click", () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const nextValue = typeof reader.result === "string" ? reader.result : "";
        state.authJsonInput = nextValue;
        actions.onAuthJsonInput(nextValue);
        updateSaveButton();
      });
      reader.readAsText(file);
    });
    fileInput.click();
  });

  uploadRow.append(uploadBtn);
  field.append(label, textarea);
  wrap.append(steps, field, uploadRow);
  return wrap;
}

function getDeviceAuthButtonLabel(status: DeviceAuthStatus): string {
  switch (status) {
    case "starting":
      return "Starting…";
    case "pending":
      return "Restart device auth";
    case "complete":
      return "Start again";
    case "expired":
      return "Start again";
    case "idle":
    default:
      return "Start device auth";
  }
}

function getDeviceAuthStatusMessage(state: OpenaiSetupStepState): string {
  if (state.deviceAuthError) {
    return state.deviceAuthError;
  }

  switch (state.deviceAuthStatus) {
    case "starting":
      return "Requesting a device code from OpenAI…";
    case "pending": {
      const expiresAt = state.deviceAuthExpiresAt ? new Date(state.deviceAuthExpiresAt).toLocaleTimeString() : null;
      const cadence = state.deviceAuthIntervalSeconds > 0 ? `Polling every ${state.deviceAuthIntervalSeconds}s.` : "";
      const expiry = expiresAt ? ` Expires around ${expiresAt}.` : "";
      return `Waiting for approval on the OpenAI verification page. ${cadence}${expiry}`.trim();
    }
    case "complete":
      return "Authorization complete. Saving tokens and continuing to the next step…";
    case "expired":
      return "This device code is no longer valid. Start a new flow or use the manual auth.json fallback.";
    case "idle":
    default:
      return "Ready to start the in-browser OpenAI device flow.";
  }
}
