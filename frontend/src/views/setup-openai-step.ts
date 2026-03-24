import { buildSetupError, buildTitleWithBadge } from "./setup-shared";

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
  deviceAuthRemainingSeconds: number;
}

export interface OpenaiSetupStepActions {
  onSelectAuthMode: (mode: OpenaiAuthMode) => void;
  onOpenaiKeyInput: (value: string) => void;
  onAuthJsonInput: (value: string) => void;
  onStartDeviceAuth: () => void;
  onCancelDeviceAuth: () => void;
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
  apiKeyCard.setAttribute("role", "button");
  apiKeyCard.setAttribute("tabindex", "0");
  apiKeyCard.setAttribute("aria-pressed", String(state.authMode === "api_key"));
  apiKeyCard.innerHTML =
    '<div class="setup-auth-card-title">API Key</div>' +
    '<div class="setup-auth-card-desc">Paste an OpenAI API key directly. Best for pay-as-you-go accounts.</div>';
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
    '<div class="setup-auth-card-title">Codex Login</div>' +
    '<div class="setup-auth-card-desc">Sign in with the browser-based OpenAI flow. Best for OpenAI-authenticated accounts.</div>';
  loginCard.addEventListener("click", () => actions.onSelectAuthMode("codex_login"));
  loginCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      actions.onSelectAuthMode("codex_login");
    }
  });

  modeWrap.append(apiKeyCard, loginCard);
  el.append(titleRow, sub, modeWrap);

  const actionsRow = document.createElement("div");
  actionsRow.className = "setup-actions";

  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "mc-button is-ghost is-sm";
  skip.textContent = "Skip for now";
  skip.addEventListener("click", actions.onSkip);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
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
    'OpenAI API Key &middot; <a class="setup-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">Get one →</a>';

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
  hint.textContent = "Paste a key that begins with sk-. Symphony stores it encrypted before saving.";

  field.append(label, input, hint);
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
    "Before signing in, enable <strong>device code authorization for Codex</strong> in " +
    '<a class="setup-link" href="https://chatgpt.com/#settings/Security" target="_blank" rel="noopener">ChatGPT Settings → Security</a>.' +
    "</div>" +
    "</div>" +
    '<div style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.7">' +
    "Click the button below to open OpenAI's sign-in page in your browser. Use the manual <code>auth.json</code> paste only as a fallback." +
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
  desc.textContent = "Click to open OpenAI's sign-in page. After approving, you'll be redirected back automatically.";

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
    cancelBtn.textContent = "Cancel";
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
  badge.textContent = state.deviceAuthStatus;

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
  title.textContent = "Fallback: paste auth.json manually";

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
    hint.textContent = "Only needed if device auth fails or if you already have an auth.json file to reuse.";
    details.append(hint);
    return wrap;
  }

  const steps = document.createElement("div");
  steps.id = stepsId;
  steps.className = "setup-device-auth-copy";
  steps.innerHTML =
    "1. Run <code>codex login --device-auth</code> in a terminal if needed.<br>" +
    "2. Finish the authorization flow on OpenAI.<br>" +
    "3. Paste <code>~/.codex/auth.json</code> below or upload the file.";

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
      return "Sign in with OpenAI";
  }
}

function getDeviceAuthStatusMessage(state: OpenaiSetupStepState): string {
  if (state.deviceAuthError) {
    return state.deviceAuthError;
  }

  switch (state.deviceAuthStatus) {
    case "starting":
      return "Opening OpenAI sign-in page…";
    case "pending":
      return "Waiting for you to sign in on the OpenAI page. Click Cancel to stop waiting, or Retry to open a new sign-in window.";
    case "complete":
      return "Signed in successfully! Saving tokens and continuing…";
    case "expired":
      return "Authentication timed out. Click the button above to try again, or use the manual fallback.";
    case "idle":
    default:
      return "Click the button above to sign in with your OpenAI account.";
  }
}
