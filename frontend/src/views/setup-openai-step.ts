import { buildSetupError, buildTitleWithBadge, getSetupErrorMessage } from "./setup-shared";

export type OpenaiAuthMode = "api_key" | "codex_login" | "proxy_provider";
export type DeviceAuthStatus = "idle" | "starting" | "pending" | "complete" | "expired";

export interface OpenaiSetupStepState {
  loading: boolean;
  error: string | null;
  openaiKeyInput: string;
  providerNameInput: string;
  providerBaseUrlInput: string;
  providerTokenInput: string;
  authMode: OpenaiAuthMode;
  authJsonInput: string;
  showManualAuthFallback: boolean;
  deviceAuthStatus: DeviceAuthStatus;
  deviceAuthUserCode: string;
  deviceAuthVerificationUri: string;
  deviceAuthIntervalSeconds: number;
  deviceAuthExpiresAt: number | null;
  deviceAuthError: string | null;
  deviceAuthRemainingSeconds: number;
}

export interface OpenaiSetupStepActions {
  onSelectAuthMode: (mode: OpenaiAuthMode) => void;
  onOpenaiKeyInput: (value: string) => void;
  onProviderNameInput: (value: string) => void;
  onProviderBaseUrlInput: (value: string) => void;
  onProviderTokenInput: (value: string) => void;
  onAuthJsonInput: (value: string) => void;
  onStartDeviceAuth: () => void;
  onCancelDeviceAuth: () => void;
  onToggleManualAuthFallback: () => void;
  onAdvance: () => void;
  onSkip: () => void;
}

export function buildOpenaiKeyStep(state: OpenaiSetupStepState, actions: OpenaiSetupStepActions): HTMLElement {
  const el = document.createElement("div");

  const titleRow = buildTitleWithBadge("Set up OpenAI access", "is-required", "Required");

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.textContent = "Choose how Risoluto signs in to OpenAI.";

  const modeWrap = document.createElement("div");
  modeWrap.className = "setup-auth-grid";

  const apiKeyCard = document.createElement("div");
  apiKeyCard.className = `setup-auth-card${state.authMode === "api_key" ? " is-selected" : ""}`;
  apiKeyCard.setAttribute("role", "button");
  apiKeyCard.setAttribute("tabindex", "0");
  apiKeyCard.setAttribute("aria-pressed", String(state.authMode === "api_key"));
  apiKeyCard.innerHTML =
    '<div class="setup-auth-card-title">API key</div>' +
    '<div class="setup-auth-card-desc">Paste an OpenAI API key directly. Best if you already have one.</div>';
  apiKeyCard.addEventListener("click", () => actions.onSelectAuthMode("api_key"));
  apiKeyCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      actions.onSelectAuthMode("api_key");
    }
  });

  const loginCard = document.createElement("div");
  loginCard.className = `setup-auth-card${state.authMode === "codex_login" ? " is-selected" : ""}`;
  loginCard.setAttribute("role", "button");
  loginCard.setAttribute("tabindex", "0");
  loginCard.setAttribute("aria-pressed", String(state.authMode === "codex_login"));
  loginCard.innerHTML =
    '<div class="setup-auth-card-title">Browser sign-in</div>' +
    '<div class="setup-auth-card-desc">Use OpenAI’s browser flow. Best if you already sign in with ChatGPT.</div>';
  loginCard.addEventListener("click", () => actions.onSelectAuthMode("codex_login"));
  loginCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      actions.onSelectAuthMode("codex_login");
    }
  });

  const proxyCard = document.createElement("div");
  proxyCard.className = `setup-auth-card${state.authMode === "proxy_provider" ? " is-selected" : ""}`;
  proxyCard.setAttribute("role", "button");
  proxyCard.setAttribute("tabindex", "0");
  proxyCard.setAttribute("aria-pressed", String(state.authMode === "proxy_provider"));
  proxyCard.innerHTML =
    '<div class="setup-auth-card-title">Proxy / compatible provider</div>' +
    '<div class="setup-auth-card-desc">Use a host-side proxy or OpenAI-compatible endpoint such as CLIProxyAPI or LiteLLM.</div>';
  proxyCard.addEventListener("click", () => actions.onSelectAuthMode("proxy_provider"));
  proxyCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      actions.onSelectAuthMode("proxy_provider");
    }
  });

  modeWrap.append(apiKeyCard, loginCard, proxyCard);
  el.append(titleRow, sub, modeWrap);

  const actionsRow = document.createElement("div");
  actionsRow.className = "setup-actions";

  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "mc-button is-ghost is-sm";
  skip.textContent = "Skip this step";
  skip.addEventListener("click", actions.onSkip);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "mc-button is-primary";
  saveBtn.textContent = state.loading ? "Saving…" : "Save and continue";

  const updateSaveButton = (): void => {
    const hasInput =
      state.authMode === "api_key"
        ? !!state.openaiKeyInput
        : state.authMode === "proxy_provider"
          ? !!state.providerBaseUrlInput && !!state.providerTokenInput
          : !!state.authJsonInput;
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

  if (state.authMode === "proxy_provider") {
    el.append(buildProxyProviderFields(state, actions, updateSaveButton));
  }

  if (state.error) {
    el.append(buildSetupError(state.error));
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
  const inputId = "setup-openai-api-key";
  const hintId = "setup-openai-api-key-hint";
  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.htmlFor = inputId;
  label.innerHTML =
    'OpenAI API key &middot; <a class="setup-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">Create one →</a>';

  const input = document.createElement("input");
  input.id = inputId;
  input.className = "setup-input";
  input.type = "password";
  input.required = true;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("aria-describedby", hintId);
  input.placeholder = "sk-…";
  input.value = state.openaiKeyInput;
  input.addEventListener("input", () => {
    state.openaiKeyInput = input.value;
    actions.onOpenaiKeyInput(input.value);
    updateSaveButton();
  });

  const hint = document.createElement("div");
  hint.id = hintId;
  hint.className = "setup-hint";
  hint.textContent = "Paste a key that starts with sk-. Risoluto stores it encrypted before saving.";

  field.append(label, input, hint);
  return field;
}

function buildProxyProviderFields(
  state: OpenaiSetupStepState,
  actions: OpenaiSetupStepActions,
  updateSaveButton: () => void,
): HTMLElement {
  const wrap = document.createElement("div");

  const callout = document.createElement("div");
  callout.className = "setup-callout";
  callout.innerHTML =
    '<strong style="color:var(--text-accent)">Proxy mode</strong>' +
    '<div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-1);line-height:1.7">' +
    "Use this when you run a local proxy or another OpenAI-compatible endpoint. Risoluto stores the token encrypted and writes an explicit <code>codex.provider</code> block for the runtime." +
    "</div>";

  const nameId = "setup-openai-provider-name";
  const baseUrlId = "setup-openai-provider-base-url";
  const baseUrlHintId = "setup-openai-provider-base-url-hint";
  const tokenId = "setup-openai-provider-token";
  const tokenHintId = "setup-openai-provider-token-hint";

  const nameField = document.createElement("div");
  nameField.className = "setup-field";

  const nameLabel = document.createElement("label");
  nameLabel.className = "setup-label";
  nameLabel.htmlFor = nameId;
  nameLabel.textContent = "Display name (optional)";

  const nameInput = document.createElement("input");
  nameInput.id = nameId;
  nameInput.className = "setup-input";
  nameInput.type = "text";
  nameInput.placeholder = "CLIProxyAPI";
  nameInput.value = state.providerNameInput;
  nameInput.addEventListener("input", () => {
    state.providerNameInput = nameInput.value;
    actions.onProviderNameInput(nameInput.value);
  });
  nameField.append(nameLabel, nameInput);

  const baseUrlField = document.createElement("div");
  baseUrlField.className = "setup-field";

  const baseUrlLabel = document.createElement("label");
  baseUrlLabel.className = "setup-label";
  baseUrlLabel.htmlFor = baseUrlId;
  baseUrlLabel.textContent = "Provider base URL";

  const baseUrlInput = document.createElement("input");
  baseUrlInput.id = baseUrlId;
  baseUrlInput.className = "setup-input";
  baseUrlInput.type = "url";
  baseUrlInput.required = true;
  baseUrlInput.spellcheck = false;
  baseUrlInput.placeholder = "http://127.0.0.1:8317/v1";
  baseUrlInput.setAttribute("aria-describedby", baseUrlHintId);
  baseUrlInput.value = state.providerBaseUrlInput;
  baseUrlInput.addEventListener("input", () => {
    state.providerBaseUrlInput = baseUrlInput.value;
    actions.onProviderBaseUrlInput(baseUrlInput.value);
    updateSaveButton();
  });

  const baseUrlHint = document.createElement("div");
  baseUrlHint.id = baseUrlHintId;
  baseUrlHint.className = "setup-hint";
  baseUrlHint.textContent = "Point this at the OpenAI-compatible /v1 endpoint that your workers should use.";

  baseUrlField.append(baseUrlLabel, baseUrlInput, baseUrlHint);

  const tokenField = document.createElement("div");
  tokenField.className = "setup-field";

  const tokenLabel = document.createElement("label");
  tokenLabel.className = "setup-label";
  tokenLabel.htmlFor = tokenId;
  tokenLabel.textContent = "Provider API key or token";

  const tokenInput = document.createElement("input");
  tokenInput.id = tokenId;
  tokenInput.className = "setup-input";
  tokenInput.type = "password";
  tokenInput.required = true;
  tokenInput.autocomplete = "off";
  tokenInput.spellcheck = false;
  tokenInput.placeholder = "sk-… or provider token";
  tokenInput.setAttribute("aria-describedby", tokenHintId);
  tokenInput.value = state.providerTokenInput;
  tokenInput.addEventListener("input", () => {
    state.providerTokenInput = tokenInput.value;
    actions.onProviderTokenInput(tokenInput.value);
    updateSaveButton();
  });

  const tokenHint = document.createElement("div");
  tokenHint.id = tokenHintId;
  tokenHint.className = "setup-hint";
  tokenHint.textContent =
    "Risoluto stores this encrypted and passes it through as OPENAI_API_KEY for the configured provider.";

  tokenField.append(tokenLabel, tokenInput, tokenHint);

  wrap.append(callout, nameField, baseUrlField, tokenField);
  return wrap;
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
    '<strong style="color:var(--text-accent)">Before you start</strong>' +
    '<div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-1);line-height:1.6">' +
    "Enable <strong>device code authorization for Codex</strong> in " +
    '<a class="setup-link" href="https://chatgpt.com/#settings/Security" target="_blank" rel="noopener">ChatGPT Settings → Security</a>.' +
    "</div>" +
    "</div>" +
    '<div style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.7">' +
    "Use the button below to open OpenAI sign-in in your browser. If that doesn't work, paste <code>auth.json</code> instead." +
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
  title.textContent = "Browser sign-in";

  const desc = document.createElement("div");
  desc.className = "setup-device-auth-copy";
  desc.textContent = "Open OpenAI sign-in in your browser. After you approve it, Risoluto continues automatically.";

  header.append(title, desc);

  const actionRow = document.createElement("div");
  actionRow.className = "setup-device-auth-actions";

  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.className = "mc-button is-primary is-sm";
  startBtn.textContent = getDeviceAuthButtonLabel(state.deviceAuthStatus);
  startBtn.disabled = state.loading || state.deviceAuthStatus === "starting";
  startBtn.addEventListener("click", actions.onStartDeviceAuth);
  actionRow.append(startBtn);

  // Show cancel button when pending
  if (state.deviceAuthStatus === "pending") {
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "mc-button is-ghost is-sm";
    cancelBtn.textContent = "Cancel sign-in";
    cancelBtn.addEventListener("click", actions.onCancelDeviceAuth);
    actionRow.append(cancelBtn);
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
  badge.textContent = getDeviceAuthBadgeLabel(state.deviceAuthStatus);

  // Show countdown timer next to badge when pending
  if (state.deviceAuthStatus === "pending" && state.deviceAuthRemainingSeconds > 0) {
    const countdown = document.createElement("span");
    countdown.className = "setup-device-auth-countdown";
    const mins = Math.floor(state.deviceAuthRemainingSeconds / 60);
    const secs = state.deviceAuthRemainingSeconds % 60;
    countdown.textContent = `${mins}:${String(secs).padStart(2, "0")} remaining`;
    statusRow.append(badge, countdown);
  } else {
    statusRow.append(badge);
  }

  const message = document.createElement("div");
  message.className = "setup-device-auth-copy";
  message.setAttribute("role", state.deviceAuthError ? "alert" : "status");
  message.setAttribute("aria-live", state.deviceAuthError ? "assertive" : "polite");
  message.setAttribute("aria-atomic", "true");
  message.textContent = getDeviceAuthStatusMessage(state);
  statusRow.append(message);
  statusWrap.append(statusRow);

  return statusWrap;
}

function buildManualFallback(
  state: OpenaiSetupStepState,
  actions: OpenaiSetupStepActions,
  updateSaveButton: () => void,
): HTMLElement {
  const detailsId = "setup-manual-auth-details";
  const textareaId = "setup-openai-auth-json";
  const stepsId = "setup-openai-auth-json-steps";
  const wrap = document.createElement("section");
  wrap.className = "setup-manual-auth";

  const header = document.createElement("div");
  header.className = "setup-manual-auth-header";

  const title = document.createElement("div");
  title.className = "setup-label";
  title.style.marginBottom = "0";
  title.textContent = "Fallback: paste auth.json";

  const toggle = document.createElement("button");
  toggle.className = "mc-button is-ghost is-sm";
  toggle.type = "button";
  toggle.textContent = state.showManualAuthFallback ? "Hide fallback" : "Use auth.json instead";
  toggle.setAttribute("aria-expanded", String(state.showManualAuthFallback));
  toggle.setAttribute("aria-controls", detailsId);
  toggle.addEventListener("click", () => {
    actions.onToggleManualAuthFallback();
    updateSaveButton();
  });

  header.append(title, toggle);
  wrap.append(header);

  const details = document.createElement("div");
  details.id = detailsId;
  wrap.append(details);

  if (!state.showManualAuthFallback) {
    const hint = document.createElement("div");
    hint.className = "setup-device-auth-copy";
    hint.textContent = "Only needed if browser sign-in fails or you already have an auth.json file.";
    details.append(hint);
    return wrap;
  }

  const steps = document.createElement("div");
  steps.id = stepsId;
  steps.className = "setup-device-auth-copy";
  steps.innerHTML =
    "1. Run <code>codex login --device-auth</code> in a terminal if you still need an auth.json file.<br>" +
    "2. Finish the OpenAI sign-in.<br>" +
    "3. Paste or upload <code>~/.codex/auth.json</code> below.";

  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.htmlFor = textareaId;
  label.textContent = "auth.json contents";

  const textarea = document.createElement("textarea");
  textarea.id = textareaId;
  textarea.className = "setup-input";
  textarea.required = true;
  textarea.autocomplete = "off";
  textarea.spellcheck = false;
  textarea.setAttribute("autocapitalize", "off");
  textarea.setAttribute("aria-describedby", stepsId);
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
  uploadBtn.type = "button";
  uploadBtn.textContent = "Upload file";
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
  details.append(steps, field, uploadRow);
  return wrap;
}

function getDeviceAuthButtonLabel(status: DeviceAuthStatus): string {
  switch (status) {
    case "starting":
      return "Opening sign-in…";
    case "pending":
      return "Retry sign-in";
    case "complete":
      return "Sign in again";
    case "expired":
      return "Try again";
    case "idle":
    default:
      return "Open sign-in";
  }
}

function getDeviceAuthBadgeLabel(status: DeviceAuthStatus): string {
  switch (status) {
    case "starting":
      return "Opening";
    case "pending":
      return "Waiting";
    case "complete":
      return "Signed in";
    case "expired":
      return "Expired";
    case "idle":
    default:
      return "Ready";
  }
}

function getDeviceAuthStatusMessage(state: OpenaiSetupStepState): string {
  if (state.deviceAuthError) {
    return getSetupErrorMessage(state.deviceAuthError);
  }

  switch (state.deviceAuthStatus) {
    case "starting":
      return "Opening OpenAI sign-in…";
    case "pending":
      return "Waiting for you to approve the sign-in. Cancel to stop waiting, or retry to open a new window.";
    case "complete":
      return "You're signed in. Saving tokens and continuing…";
    case "expired":
      return "The sign-in session expired. Open a new sign-in window or use the manual fallback.";
    case "idle":
    default:
      return "Click the button above to open OpenAI sign-in.";
  }
}
