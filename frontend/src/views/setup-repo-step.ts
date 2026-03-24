import { buildTitleWithBadge } from "./setup-shared";

export interface RepoConfigStepState {
  loading: boolean;
  error: string | null;
  teamKey: string | null;
  repoUrlInput: string;
  defaultBranchInput: string;
  labelInput: string;
  showAdvanced: boolean;
  routes: Array<Record<string, unknown>>;
}

export interface RepoConfigStepActions {
  onRepoUrlInput: (value: string) => void;
  onDefaultBranchInput: (value: string) => void;
  onLabelInput: (value: string) => void;
  onToggleAdvanced: () => void;
  onSave: () => void;
  onSkip: () => void;
  onDeleteRoute: (index: number) => void;
}

function buildExistingRoutes(
  routes: Array<Record<string, unknown>>,
  actions: RepoConfigStepActions,
): HTMLElement | null {
  if (routes.length === 0) {
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = "setup-repo-routes";
  wrap.style.marginTop = "var(--space-4)";

  const label = document.createElement("div");
  label.className = "setup-label";
  label.textContent = "Linked repositories";
  wrap.append(label);

  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "var(--space-2)";

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const row = document.createElement("div");
    row.className = "setup-repo-route-row";
    row.style.cssText =
      "display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) var(--space-3);border:var(--stroke-default) solid var(--border-stitch);background:var(--bg-muted)";

    const info = document.createElement("div");
    info.style.flex = "1";
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "var(--text-xs)";

    const prefix = document.createElement("span");
    prefix.style.cssText = "font-weight:700;color:var(--text-primary);margin-right:var(--space-2)";
    prefix.textContent = String(route.identifier_prefix ?? "");

    const url = document.createElement("span");
    url.style.color = "var(--text-secondary)";
    url.textContent = String(route.repo_url ?? "");

    info.append(prefix, url);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "mc-button is-ghost is-sm";
    deleteBtn.textContent = "Remove";
    deleteBtn.style.color = "var(--status-blocked)";
    deleteBtn.addEventListener("click", () => {
      actions.onDeleteRoute(i);
    });

    row.append(info, deleteBtn);
    list.append(row);
  }

  wrap.append(list);
  return wrap;
}

export function buildRepoConfigStep(state: RepoConfigStepState, actions: RepoConfigStepActions): HTMLElement {
  const el = document.createElement("div");

  const titleRow = buildTitleWithBadge("Link your repository", "is-optional", "Optional");

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.textContent = "Tell Symphony which GitHub repo to target when handling issues from this Linear project.";

  const callout = document.createElement("div");
  callout.className = "setup-callout";
  callout.textContent =
    "Repos are optional — Symphony can use directory strategy without them. " +
    "But linking a repo enables direct branch pushes and PR creation.";

  el.append(titleRow, sub, callout);

  const existingRoutes = buildExistingRoutes(state.routes, actions);
  if (existingRoutes) {
    el.append(existingRoutes);
  }

  const prefixField = document.createElement("div");
  prefixField.className = "setup-field";
  prefixField.style.marginTop = "var(--space-4)";

  const prefixLabel = document.createElement("label");
  prefixLabel.className = "setup-label";
  prefixLabel.textContent = "Identifier prefix";

  const prefixChip = document.createElement("div");
  prefixChip.style.cssText =
    "display:inline-flex;align-items:center;padding:var(--space-1) var(--space-3);background:var(--bg-muted);border:var(--stroke-default) solid var(--border-stitch);font-family:var(--font-mono);font-size:var(--text-sm);font-weight:700;color:var(--text-primary)";
  prefixChip.textContent = state.teamKey ?? "N/A";

  const prefixHint = document.createElement("div");
  prefixHint.className = "setup-hint";
  prefixHint.textContent = "Derived from your Linear team key. Issues with this prefix will target the repo below.";

  prefixField.append(prefixLabel, prefixChip, prefixHint);

  const urlField = document.createElement("div");
  urlField.className = "setup-field";

  const urlLabel = document.createElement("label");
  urlLabel.className = "setup-label";
  urlLabel.textContent = "GitHub repository URL";

  const urlInput = document.createElement("input");
  urlInput.className = "setup-input";
  urlInput.type = "url";
  urlInput.placeholder = "https://github.com/org/repo";
  urlInput.value = state.repoUrlInput;
  urlInput.addEventListener("input", () => {
    actions.onRepoUrlInput(urlInput.value);
  });

  urlField.append(urlLabel, urlInput);

  const branchField = document.createElement("div");
  branchField.className = "setup-field";

  const branchLabel = document.createElement("label");
  branchLabel.className = "setup-label";
  branchLabel.textContent = "Default branch";

  const branchInput = document.createElement("input");
  branchInput.className = "setup-input";
  branchInput.placeholder = "main";
  branchInput.value = state.defaultBranchInput;
  branchInput.addEventListener("input", () => {
    actions.onDefaultBranchInput(branchInput.value);
  });

  branchField.append(branchLabel, branchInput);

  el.append(prefixField, urlField, branchField);

  const advancedToggle = document.createElement("button");
  advancedToggle.className = "mc-button is-ghost is-sm";
  advancedToggle.style.marginTop = "var(--space-3)";
  advancedToggle.textContent = state.showAdvanced ? "Hide advanced" : "Advanced options";
  advancedToggle.addEventListener("click", () => {
    actions.onToggleAdvanced();
  });

  el.append(advancedToggle);

  if (state.showAdvanced) {
    const labelField = document.createElement("div");
    labelField.className = "setup-field";
    labelField.style.marginTop = "var(--space-2)";

    const labelLabel = document.createElement("label");
    labelLabel.className = "setup-label";
    labelLabel.textContent = "Label-based routing (optional)";

    const labelInput = document.createElement("input");
    labelInput.className = "setup-input";
    labelInput.placeholder = "e.g. backend";
    labelInput.value = state.labelInput;
    labelInput.addEventListener("input", () => {
      actions.onLabelInput(labelInput.value);
    });

    const labelHint = document.createElement("div");
    labelHint.className = "setup-hint";
    labelHint.textContent =
      "If set, issues with this label will also route to this repo (in addition to prefix matching).";

    labelField.append(labelLabel, labelInput, labelHint);
    el.append(labelField);
  }

  if (state.error) {
    const err = document.createElement("div");
    err.className = "setup-error";
    err.textContent = state.error;
    el.append(err);
  }

  const actionsRow = document.createElement("div");
  actionsRow.className = "setup-actions";

  const skipBtn = document.createElement("button");
  skipBtn.className = "mc-button is-ghost is-sm";
  skipBtn.textContent = "Skip";
  skipBtn.addEventListener("click", () => {
    actions.onSkip();
  });

  const saveBtn = document.createElement("button");
  saveBtn.className = "mc-button is-primary";
  saveBtn.textContent = state.loading ? "Saving…" : "Save & Continue";
  saveBtn.disabled = state.loading || !state.repoUrlInput.trim();
  saveBtn.addEventListener("click", () => {
    actions.onSave();
  });

  actionsRow.append(skipBtn, saveBtn);
  el.append(actionsRow);

  return el;
}
