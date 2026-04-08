import { buildSetupError } from "./setup-shared";

export interface MasterKeyStepState {
  loading: boolean;
  error: string | null;
  generatedKey: string | null;
}

export interface MasterKeyStepActions {
  onAdvance: () => void;
  onGenerateKey: () => void;
  onResetSetup: () => void;
}

function buildKeyAlreadySetView(state: MasterKeyStepState, actions: MasterKeyStepActions): HTMLElement {
  const el = document.createElement("div");

  const title = document.createElement("div");
  title.className = "setup-title";
  title.textContent = "Secure your credentials";

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.textContent =
    "Risoluto created this encryption key during a previous setup. Keep a backup if you move this machine.";

  const badge = document.createElement("div");
  badge.className = "setup-callout";
  const badgeIcon = document.createTextNode("✓ ");
  const badgeStrong = document.createElement("strong");
  badgeStrong.textContent = "Encryption key is ready. ";
  const badgeText = document.createTextNode("Stored secrets on this machine are still encrypted.");
  badge.append(badgeIcon, badgeStrong, badgeText);

  const actionsRow = document.createElement("div");
  actionsRow.className = "setup-actions";

  const next = document.createElement("button");
  next.className = "mc-button is-primary";
  next.type = "button";
  next.textContent = "Continue →";
  next.addEventListener("click", () => actions.onAdvance());
  actionsRow.append(next);

  const dangerZone = document.createElement("div");
  dangerZone.className = "setup-danger-zone";

  const reconfigure = document.createElement("button");
  reconfigure.className = "mc-button is-ghost is-sm";
  reconfigure.type = "button";
  reconfigure.textContent = state.loading ? "Resetting…" : "Reset all credentials";
  reconfigure.disabled = state.loading;
  reconfigure.addEventListener("click", () => actions.onResetSetup());
  dangerZone.append(reconfigure);

  if (state.error) {
    el.append(title, sub, badge, buildSetupError(state.error), actionsRow, dangerZone);
  } else {
    el.append(title, sub, badge, actionsRow, dangerZone);
  }

  return el;
}

function buildCopyButton(generatedKey: string | null): HTMLButtonElement {
  const copyBtn = document.createElement("button");
  copyBtn.className = "mc-button is-ghost is-sm";
  copyBtn.type = "button";
  copyBtn.textContent = "Copy key";
  copyBtn.addEventListener("click", () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey).catch(() => {});
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = "Copy key";
    }, 1500);
  });
  return copyBtn;
}

function buildKeyNewView(state: MasterKeyStepState, actions: MasterKeyStepActions): HTMLElement {
  const el = document.createElement("div");

  const title = document.createElement("div");
  title.className = "setup-title";
  title.textContent = "Secure your credentials";

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.textContent =
    "Risoluto uses one encryption key to protect stored credentials on this machine. Copy it somewhere safe before you continue.";

  const callout = document.createElement("div");
  callout.className = "setup-callout";
  const calloutStrong = document.createElement("strong");
  calloutStrong.textContent = "Save this key somewhere safe. ";
  const calloutText = document.createTextNode(
    "If you lose it, you'll need to create a new one and re-enter your secrets.",
  );
  callout.append(calloutStrong, calloutText);

  const keyDisplay = document.createElement("div");
  keyDisplay.className = "setup-key-display";

  const keyValue = document.createElement("div");
  keyValue.className = "setup-key-value";
  keyValue.textContent = state.generatedKey ?? "Generating…";

  keyDisplay.append(keyValue, buildCopyButton(state.generatedKey));

  const actionsRow = document.createElement("div");
  actionsRow.className = "setup-actions";

  const regen = document.createElement("button");
  regen.className = "mc-button is-ghost is-sm setup-actions-secondary";
  regen.type = "button";
  regen.textContent = "Generate new key";
  regen.disabled = state.loading;
  regen.addEventListener("click", () => actions.onGenerateKey());

  const next = document.createElement("button");
  next.className = "mc-button is-primary";
  next.type = "button";
  next.textContent = state.loading ? "Saving…" : "Continue →";
  next.disabled = state.loading || !state.generatedKey;
  next.addEventListener("click", () => actions.onAdvance());

  actionsRow.append(regen, next);

  if (state.error) {
    el.append(title, sub, callout, keyDisplay, buildSetupError(state.error), actionsRow);
  } else {
    el.append(title, sub, callout, keyDisplay, actionsRow);
  }

  return el;
}

/**
 * Builds the master-key setup step DOM.
 * Pure function — takes state and action callbacks, returns an HTMLElement.
 */
export function buildMasterKeyStep(state: MasterKeyStepState, actions: MasterKeyStepActions): HTMLElement {
  if (state.generatedKey === "set") {
    return buildKeyAlreadySetView(state, actions);
  }
  return buildKeyNewView(state, actions);
}
