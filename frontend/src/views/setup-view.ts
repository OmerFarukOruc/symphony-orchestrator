import { api } from "../api";
import { router } from "../router";
import { registerPageCleanup } from "../utils/page";
import { createSingleFlight } from "../utils/single-flight";
import { buildRepoConfigStep, type RepoConfigStepActions, type RepoConfigStepState } from "./setup-repo-step";
import { createSetupDeviceAuthController } from "./setup-openai-controller";
import {
  buildOpenaiKeyStep as buildOpenaiKeyStepContent,
  type DeviceAuthStatus,
  type OpenaiAuthMode,
  type OpenaiSetupStepState,
} from "./setup-openai-step";
import { buildSetupError, buildTitleWithBadge } from "./setup-shared";

type SetupStep = "master-key" | "linear-project" | "repo-config" | "openai-key" | "github-token" | "done";

interface SetupState {
  step: SetupStep;
  loading: boolean;
  error: string | null;
  generatedKey: string | null;
  apiKeyInput: string;
  apiKeyVerified: boolean;
  projects: Array<{ id: unknown; name: unknown; slugId: string; teamKey: unknown }>;
  selectedProject: string | null;
  teamKey: string | null;
  repoUrlInput: string;
  defaultBranchInput: string;
  labelInput: string;
  showRepoAdvanced: boolean;
  repoRoutes: Array<Record<string, unknown>>;
  tokenInput: string;
  openaiKeyInput: string;
  authMode: OpenaiAuthMode;
  authJsonInput: string;
  showManualAuthFallback: boolean;
  deviceAuthStatus: DeviceAuthStatus;
  deviceAuthUserCode: string;
  deviceAuthVerificationUri: string;
  deviceAuthDeviceCode: string;
  deviceAuthIntervalSeconds: number;
  deviceAuthExpiresAt: number | null;
  deviceAuthError: string | null;
  testIssueLoading: boolean;
  testIssueCreated: boolean;
  testIssueIdentifier: string | null;
  testIssueUrl: string | null;
  testIssueError: string | null;
  labelLoading: boolean;
  labelCreated: boolean;
  labelName: string | null;
  labelError: string | null;
  createdProjectUrl: string | null;
  createdProjectName: string | null;
}

const state: SetupState = {
  step: "master-key",
  loading: false,
  error: null,
  generatedKey: null,
  apiKeyInput: "",
  apiKeyVerified: false,
  projects: [],
  selectedProject: null,
  teamKey: null,
  repoUrlInput: "",
  defaultBranchInput: "main",
  labelInput: "",
  showRepoAdvanced: false,
  repoRoutes: [],
  tokenInput: "",
  openaiKeyInput: "",
  authMode: "api_key",
  authJsonInput: "",
  showManualAuthFallback: false,
  deviceAuthStatus: "idle",
  deviceAuthUserCode: "",
  deviceAuthVerificationUri: "",
  deviceAuthDeviceCode: "",
  deviceAuthIntervalSeconds: 0,
  deviceAuthExpiresAt: null,
  deviceAuthError: null,
  testIssueLoading: false,
  testIssueCreated: false,
  testIssueIdentifier: null,
  testIssueUrl: null,
  testIssueError: null,
  labelLoading: false,
  labelCreated: false,
  labelName: null,
  labelError: null,
  createdProjectUrl: null,
  createdProjectName: null,
};

let container: HTMLElement | null = null;
const deviceAuthController = createSetupDeviceAuthController(state, {
  rerender,
  moveToGithubStep,
});

function rerender(): void {
  if (!container) return;
  container.replaceChildren(buildPage());
}

function setLoading(loading: boolean): void {
  state.loading = loading;
  rerender();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Step indicator ────────────────────────────────────────────────────────────

function buildStepIndicator(): HTMLElement {
  const steps: Array<{ key: SetupStep; label: string; n: string }> = [
    { key: "master-key", label: "Protect secrets", n: "1" },
    { key: "linear-project", label: "Connect Linear", n: "2" },
    { key: "repo-config", label: "Link repo", n: "3" },
    { key: "openai-key", label: "Add OpenAI", n: "4" },
    { key: "github-token", label: "Add GitHub", n: "5" },
  ];

  const order: SetupStep[] = ["master-key", "linear-project", "repo-config", "openai-key", "github-token", "done"];
  const currentIdx = order.indexOf(state.step);

  const row = document.createElement("div");
  row.className = "setup-steps";

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const stepIdx = order.indexOf(s.key);
    const isDone = currentIdx > stepIdx;
    const isActive = s.key === state.step;
    const isClickable = true;

    const indicator = document.createElement("div");
    indicator.className = `setup-step-indicator${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}`;
    if (isClickable) {
      indicator.style.cursor = "pointer";
      indicator.setAttribute("role", "button");
      indicator.setAttribute("tabindex", "0");
      const targetStep = s.key;
      const handleNav = (): void => {
        state.step = targetStep;
        state.error = null;
        rerender();
      };
      indicator.addEventListener("click", handleNav);
      indicator.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleNav();
        }
      });
    }

    const dot = document.createElement("div");
    dot.className = "setup-step-dot";
    dot.textContent = isDone ? "✓" : s.n;

    const label = document.createElement("span");
    label.textContent = s.label;

    indicator.append(dot, label);
    row.append(indicator);

    if (i < steps.length - 1) {
      const connector = document.createElement("div");
      connector.className = "setup-step-connector";
      row.append(connector);
    }
  }

  return row;
}

// ── Step: Master Key ─────────────────────────────────────────────────────────

function buildMasterKeyStep(): HTMLElement {
  const el = document.createElement("div");
  const keyAlreadySet = state.generatedKey === "set";

  const title = document.createElement("div");
  title.className = "setup-title";
  title.textContent = "Protect your secrets";

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";

  if (keyAlreadySet) {
    // Key was set in a previous session — show confirmation with reconfigure option
    sub.textContent =
      "Your encryption key was generated during a previous setup. It is stored in .symphony/master.key — make sure you have a backup.";

    const badge = document.createElement("div");
    badge.className = "setup-callout";
    const badgeIcon = document.createTextNode("✓ ");
    const badgeStrong = document.createElement("strong");
    badgeStrong.textContent = "Master key is configured. ";
    const badgeText = document.createTextNode("Your stored secrets are encrypted and protected.");
    badge.append(badgeIcon, badgeStrong, badgeText);

    const actions = document.createElement("div");
    actions.className = "setup-actions";

    const reconfigure = document.createElement("button");
    reconfigure.className = "mc-button is-ghost is-sm";
    reconfigure.type = "button";
    reconfigure.textContent = state.loading ? "Resetting…" : "Reconfigure";
    reconfigure.disabled = state.loading;
    reconfigure.addEventListener("click", async () => {
      if (
        !confirm(
          "This will clear ALL stored secrets (Linear, OpenAI, GitHub keys) and generate a new encryption key. You will need to re-enter all credentials.\n\nAre you sure?",
        )
      )
        return;
      state.loading = true;
      state.error = null;
      rerender();
      try {
        await api.resetSetup();
        state.generatedKey = null;
        state.apiKeyInput = "";
        state.apiKeyVerified = false;
        state.projects = [];
        state.selectedProject = null;
        state.teamKey = null;
        state.repoUrlInput = "";
        state.defaultBranchInput = "main";
        state.labelInput = "";
        state.showRepoAdvanced = false;
        state.repoRoutes = [];
        state.tokenInput = "";
        state.openaiKeyInput = "";
        await generateAndSetKey();
      } catch (error_) {
        state.error = error_ instanceof Error ? error_.message : String(error_);
        state.loading = false;
        rerender();
      }
    });

    const next = document.createElement("button");
    next.className = "mc-button is-primary";
    next.type = "button";
    next.textContent = "Next →";
    next.addEventListener("click", () => advanceMasterKey());
    actions.append(reconfigure, next);

    if (state.error) {
      el.append(title, sub, badge, buildSetupError(state.error), actions);
    } else {
      el.append(title, sub, badge, actions);
    }
    return el;
  }

  // Key was just generated — show it so the user can copy
  sub.textContent =
    "Symphony uses an encryption key to protect stored credentials on your machine. A key has been generated for you — copy it somewhere safe before continuing.";

  const callout = document.createElement("div");
  callout.className = "setup-callout";
  const calloutStrong = document.createElement("strong");
  calloutStrong.textContent = "Important: ";
  const calloutText1 = document.createTextNode(
    "Save this key somewhere safe. It cannot be recovered if lost — you will need to delete ",
  );
  const calloutCode = document.createElement("code");
  calloutCode.textContent = ".symphony/secrets.enc";
  const calloutText2 = document.createTextNode(" and re-enter your secrets.");
  callout.append(calloutStrong, calloutText1, calloutCode, calloutText2);

  const keyDisplay = document.createElement("div");
  keyDisplay.className = "setup-key-display";

  const keyValue = document.createElement("div");
  keyValue.className = "setup-key-value";
  keyValue.textContent = state.generatedKey ?? "Generating…";

  const copyBtn = document.createElement("button");
  copyBtn.className = "mc-button is-ghost is-sm";
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => {
    if (state.generatedKey) {
      navigator.clipboard.writeText(state.generatedKey).catch(() => {});
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1500);
    }
  });

  keyDisplay.append(keyValue, copyBtn);

  const actions = document.createElement("div");
  actions.className = "setup-actions";

  const regen = document.createElement("button");
  regen.className = "mc-button is-ghost is-sm";
  regen.type = "button";
  regen.textContent = "Regenerate";
  regen.disabled = state.loading;
  regen.addEventListener("click", () => {
    generateAndSetKey().catch(() => {});
  });

  const next = document.createElement("button");
  next.className = "mc-button is-primary";
  next.type = "button";
  next.textContent = state.loading ? "Saving…" : "Next →";
  next.disabled = state.loading || !state.generatedKey;
  next.addEventListener("click", () => advanceMasterKey());

  actions.append(regen, next);

  if (state.error) {
    el.append(title, sub, callout, keyDisplay, buildSetupError(state.error), actions);
  } else {
    el.append(title, sub, callout, keyDisplay, actions);
  }

  return el;
}

const generateAndSetKey = createSingleFlight(async (): Promise<void> => {
  setLoading(true);
  state.error = null;
  try {
    const result = await api.postMasterKey();
    state.generatedKey = result.key;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 409 means the key already exists — treat as success
    if (message.includes("already")) {
      state.generatedKey = "set";
    } else {
      state.error = message;
    }
  } finally {
    setLoading(false);
  }
});

function advanceMasterKey(): void {
  if (!state.generatedKey) return;
  state.step = "linear-project";
  state.error = null;
  rerender();
}

// ── Step: Linear Project ─────────────────────────────────────────────────────

function applyStatusBadge(badge: HTMLElement): void {
  if (state.loading) {
    badge.textContent = "Verifying…";
    badge.style.color = "var(--text-muted)";
  } else if (state.apiKeyVerified) {
    badge.textContent = "✓ Valid";
    badge.style.color = "var(--status-running)";
  } else if (state.error) {
    badge.textContent = "✗ Invalid";
    badge.style.color = "var(--status-blocked)";
  }
}

function buildProjectGrid(projectGridLabelId: string): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "setup-project-grid";
  grid.setAttribute("role", "radiogroup");
  grid.setAttribute("aria-labelledby", projectGridLabelId);

  for (const p of state.projects) {
    const isSelected = state.selectedProject === p.slugId;
    const card = document.createElement("div");
    card.className = `setup-project-card${isSelected ? " is-selected" : ""}`;
    card.setAttribute("role", "radio");
    card.setAttribute("tabindex", isSelected ? "0" : "-1");
    card.setAttribute("aria-checked", isSelected ? "true" : "false");

    const name = document.createElement("div");
    name.className = "setup-project-name";
    name.textContent = String(p.name);

    const slug = document.createElement("div");
    slug.className = "setup-project-slug";
    slug.textContent = p.slugId;

    card.append(name, slug);
    const selectProject = (): void => {
      state.selectedProject = p.slugId;
      rerender();
    };
    card.addEventListener("click", selectProject);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      selectProject();
    });
    grid.append(card);
  }
  return grid;
}

function buildLinearProjectStep(): HTMLElement {
  const el = document.createElement("div");
  const apiKeyInputId = "setup-linear-api-key";
  const createProjectNameInputId = "setup-linear-create-project-name";
  const projectGridLabelId = "setup-linear-project-grid-label";

  const titleRow = buildTitleWithBadge("Connect to Linear", "is-required", "Required");

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  const subText = document.createTextNode("Enter your Linear API key and choose the project Symphony should track. ");
  const subLink = document.createElement("a");
  subLink.className = "setup-link";
  subLink.href = "https://linear.app/settings/account/security/api-keys/new";
  subLink.target = "_blank";
  subLink.rel = "noopener";
  subLink.textContent = "Create a personal API key →";
  sub.append(subText, subLink);

  const callout = document.createElement("div");
  callout.className = "setup-callout";
  const calloutText1 = document.createTextNode("When creating the key, enable ");
  const readStrong = document.createElement("strong");
  readStrong.textContent = "Read";
  const calloutText2 = document.createTextNode(" and ");
  const writeStrong = document.createElement("strong");
  writeStrong.textContent = "Write";
  const calloutText3 = document.createTextNode(" permissions with ");
  const allTeamsStrong = document.createElement("strong");
  allTeamsStrong.textContent = "All teams you have access to";
  const calloutText4 = document.createTextNode(" selected.");
  callout.append(calloutText1, readStrong, calloutText2, writeStrong, calloutText3, allTeamsStrong, calloutText4);

  // ── API key input row ──
  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.htmlFor = apiKeyInputId;
  label.textContent = "Linear API Key";

  const inputRow = document.createElement("div");
  inputRow.className = "setup-input-row";

  const statusBadge = document.createElement("div");
  statusBadge.className = "setup-key-status";
  applyStatusBadge(statusBadge);

  const verifyBtn = document.createElement("button");
  verifyBtn.className = "mc-button is-primary is-sm";
  verifyBtn.type = "button";
  verifyBtn.style.marginTop = "var(--space-2)";
  verifyBtn.textContent = state.loading ? "Verifying…" : state.apiKeyVerified ? "Re-verify" : "Verify Key";
  verifyBtn.disabled = state.loading || !state.apiKeyInput;
  verifyBtn.addEventListener("click", () => {
    loadLinearProjects().catch(() => {});
  });

  const input = document.createElement("input");
  input.id = apiKeyInputId;
  input.className = "setup-input";
  input.style.flex = "1";
  input.type = "password";
  input.placeholder = "lin_api_…";
  input.value = state.apiKeyInput;
  input.addEventListener("input", () => {
    state.apiKeyInput = input.value;
    verifyBtn.disabled = state.loading || !state.apiKeyInput;
    if (state.apiKeyVerified) {
      state.apiKeyVerified = false;
      state.projects = [];
      state.selectedProject = null;
      rerender();
    }
  });

  inputRow.append(input, statusBadge);

  field.append(label, inputRow, verifyBtn);

  el.append(titleRow, sub, callout, field);

  if (state.error && !state.apiKeyVerified) {
    el.append(buildSetupError(state.error));
  }

  if (state.apiKeyVerified && state.projects.length > 0) {
    // Show success banner if we just created a project
    if (state.createdProjectName) {
      const successBanner = document.createElement("div");
      successBanner.className = "setup-callout";
      successBanner.style.marginTop = "var(--space-4)";

      const icon = document.createTextNode("✓ ");
      const strong = document.createElement("strong");
      strong.textContent = `Project "${state.createdProjectName}" created successfully! `;
      const text = document.createTextNode("It's selected below and ready to use.");
      successBanner.append(icon, strong, text);

      if (state.createdProjectUrl) {
        const link = document.createElement("a");
        link.className = "setup-link";
        link.href = state.createdProjectUrl;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = " View in Linear →";
        successBanner.append(link);
      }
      el.append(successBanner);
    }

    const gridLabel = document.createElement("div");
    gridLabel.id = projectGridLabelId;
    gridLabel.className = "setup-label";
    gridLabel.style.marginTop = "var(--space-4)";
    gridLabel.textContent = "Select a project";
    el.append(gridLabel, buildProjectGrid(projectGridLabelId));
  } else if (state.apiKeyVerified && state.projects.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "setup-callout";
    emptyMsg.style.marginTop = "var(--space-4)";
    const emptyStrong = document.createElement("strong");
    emptyStrong.textContent = "No projects found. ";
    const emptyText = document.createTextNode("Create one below or in Linear directly.");
    emptyMsg.append(emptyStrong, emptyText);

    const createRow = document.createElement("div");
    createRow.style.display = "flex";
    createRow.style.gap = "var(--space-2)";
    createRow.style.marginTop = "var(--space-3)";
    createRow.style.alignItems = "center";

    const nameField = document.createElement("div");
    nameField.className = "setup-field";
    nameField.style.flex = "1";

    const nameLabel = document.createElement("label");
    nameLabel.className = "setup-label";
    nameLabel.htmlFor = createProjectNameInputId;
    nameLabel.textContent = "New project name";

    const nameInput = document.createElement("input");
    nameInput.id = createProjectNameInputId;
    nameInput.className = "setup-input";
    nameInput.style.flex = "1";
    nameInput.placeholder = "Project name (e.g. My App)";

    const createBtn = document.createElement("button");
    createBtn.className = "mc-button is-primary is-sm";
    createBtn.type = "button";
    createBtn.textContent = "Create Project";
    createBtn.disabled = true;
    nameInput.addEventListener("input", () => {
      createBtn.disabled = !nameInput.value.trim() || state.loading;
    });

    createBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      state.loading = true;
      state.error = null;
      createBtn.textContent = "Creating…";
      createBtn.disabled = true;
      rerender();
      try {
        const result = await api.createProject(name);
        // Show success confirmation before switching to project grid
        state.projects = [result.project];
        state.selectedProject = result.project.slugId;
        state.loading = false;
        state.error = null;

        // Store the success info for the rerender to pick up
        state.createdProjectUrl = result.project.url;
        state.createdProjectName = result.project.name;
        rerender();
      } catch (error_) {
        state.error = error_ instanceof Error ? error_.message : String(error_);
        state.loading = false;
        rerender();
      }
    });

    nameField.append(nameLabel, nameInput);
    createRow.append(nameField, createBtn);
    el.append(emptyMsg, createRow);
  }

  const actions = document.createElement("div");
  actions.className = "setup-actions";

  const skip = document.createElement("button");
  skip.className = "mc-button is-ghost is-sm";
  skip.type = "button";
  skip.textContent = "Skip";
  skip.addEventListener("click", () => {
    state.step = "github-token";
    state.error = null;
    rerender();
  });

  const next = document.createElement("button");
  next.className = "mc-button is-primary";
  next.type = "button";
  next.textContent = state.loading ? "Saving…" : "Next →";
  next.disabled = state.loading || !state.selectedProject;
  next.addEventListener("click", () => {
    advanceLinearProject().catch(() => {});
  });

  actions.append(skip, next);
  el.append(actions);

  return el;
}

async function loadLinearProjects(): Promise<void> {
  if (!state.apiKeyInput) return;
  setLoading(true);
  state.error = null;
  state.apiKeyVerified = false;
  try {
    await api.postSecret("LINEAR_API_KEY", state.apiKeyInput);
    const result = await api.getLinearProjects();
    state.projects = result.projects;
    state.apiKeyVerified = true;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    state.projects = [];
  } finally {
    setLoading(false);
  }
}

async function advanceLinearProject(): Promise<void> {
  if (!state.selectedProject) return;
  setLoading(true);
  state.error = null;
  try {
    await api.postLinearProject(state.selectedProject);
    const selectedProj = state.projects.find((p) => p.slugId === state.selectedProject);
    state.teamKey = selectedProj?.teamKey ? String(selectedProj.teamKey) : null;
    state.step = "repo-config";
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    setLoading(false);
  }
}

function buildRepoConfigStepSetup(): HTMLElement {
  const repoStepState: RepoConfigStepState = {
    loading: state.loading,
    error: state.error,
    teamKey: state.teamKey,
    repoUrlInput: state.repoUrlInput,
    defaultBranchInput: state.defaultBranchInput,
    labelInput: state.labelInput,
    showAdvanced: state.showRepoAdvanced,
    routes: state.repoRoutes,
  };

  const repoStepActions: RepoConfigStepActions = {
    onRepoUrlInput: (value) => {
      state.repoUrlInput = value;
    },
    onDefaultBranchInput: (value) => {
      state.defaultBranchInput = value;
    },
    onLabelInput: (value) => {
      state.labelInput = value;
    },
    onToggleAdvanced: () => {
      state.showRepoAdvanced = !state.showRepoAdvanced;
      rerender();
    },
    onSave: () => {
      void advanceRepoConfig();
    },
    onSkip: () => {
      state.step = "openai-key";
      state.error = null;
      rerender();
    },
    onDeleteRoute: (index) => {
      void handleDeleteRepoRoute(index);
    },
  };

  return buildRepoConfigStep(repoStepState, repoStepActions);
}

async function advanceRepoConfig(): Promise<void> {
  if (!state.repoUrlInput.trim()) return;
  setLoading(true);
  state.error = null;
  try {
    const identifierPrefix = state.teamKey ? state.teamKey.toUpperCase() : "DEFAULT";
    await api.postRepoRoute({
      repoUrl: state.repoUrlInput.trim(),
      defaultBranch: state.defaultBranchInput.trim() || "main",
      identifierPrefix,
      label: state.labelInput.trim() || undefined,
    });
    const result = await api.getRepoRoutes();
    state.repoRoutes = result.routes;
    state.step = "openai-key";
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    setLoading(false);
  }
}

async function handleDeleteRepoRoute(index: number): Promise<void> {
  setLoading(true);
  state.error = null;
  try {
    const result = await api.deleteRepoRoute(index);
    state.repoRoutes = result.routes;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    setLoading(false);
    rerender();
  }
}

function buildOpenaiKeyStep(): HTMLElement {
  const openaiStepState: OpenaiSetupStepState = {
    loading: state.loading,
    error: state.error,
    openaiKeyInput: state.openaiKeyInput,
    authMode: state.authMode,
    authJsonInput: state.authJsonInput,
    showManualAuthFallback: state.showManualAuthFallback,
    deviceAuthStatus: state.deviceAuthStatus,
    deviceAuthUserCode: state.deviceAuthUserCode,
    deviceAuthVerificationUri: state.deviceAuthVerificationUri,
    deviceAuthIntervalSeconds: state.deviceAuthIntervalSeconds,
    deviceAuthExpiresAt: state.deviceAuthExpiresAt,
    deviceAuthError: state.deviceAuthError,
    deviceAuthRemainingSeconds: deviceAuthController.getRemainingSeconds(),
  };

  return buildOpenaiKeyStepContent(openaiStepState, {
    onSelectAuthMode: (mode) => {
      deviceAuthController.selectOpenaiAuthMode(mode);
    },
    onOpenaiKeyInput: (value) => {
      state.openaiKeyInput = value;
    },
    onAuthJsonInput: (value) => {
      state.authJsonInput = value;
      rerender();
    },
    onStartDeviceAuth: () => {
      deviceAuthController.startDeviceAuthFlow().catch(() => {});
    },
    onCancelDeviceAuth: () => {
      deviceAuthController.cancelDeviceAuth().catch(() => {});
    },
    onToggleManualAuthFallback: () => {
      state.showManualAuthFallback = !state.showManualAuthFallback;
      rerender();
    },
    onAdvance: () => {
      void advanceOpenaiAuth();
    },
    onSkip: () => {
      deviceAuthController.clearDeviceAuthState();
      state.step = "github-token";
      state.error = null;
      rerender();
    },
  });
}

function moveToGithubStep(): void {
  deviceAuthController.clearDeviceAuthState();
  state.error = null;
  state.step = "github-token";
  rerender();
}

async function advanceOpenaiAuth(): Promise<void> {
  setLoading(true);
  state.error = null;
  try {
    if (state.authMode === "api_key") {
      if (!state.openaiKeyInput) return;
      const result = await api.postOpenaiKey(state.openaiKeyInput);
      if (!result.valid) {
        state.error = "Key validation failed — check your key and try again.";
        return;
      }
    } else {
      if (!state.authJsonInput) return;
      await api.postCodexAuth(state.authJsonInput);
    }
    moveToGithubStep();
    return;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    setLoading(false);
  }
}

// ── Step: GitHub Token ───────────────────────────────────────────────────────

function buildGithubTokenStep(): HTMLElement {
  const el = document.createElement("div");
  const githubTokenInputId = "setup-github-token";

  const titleRow = buildTitleWithBadge("Add GitHub access", "is-optional", "Optional");

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.textContent =
    "Add a token to enable automatic PR creation. You can skip this and add it later from Settings → Credentials.";

  const optionWrap = document.createElement("div");
  optionWrap.style.cssText =
    "display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-4)";

  const optA = document.createElement("div");
  optA.style.cssText =
    "border:var(--stroke-default) solid var(--border-stitch);padding:var(--space-3);background:var(--bg-muted)";

  const optATitle = document.createElement("div");
  optATitle.style.cssText =
    "font-family:var(--font-body);font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-2)";
  const optATitleText = document.createTextNode("Fine-grained ");
  const optARecommended = document.createElement("span");
  optARecommended.style.cssText = "font-weight:400;color:var(--text-muted);font-size:var(--text-xs)";
  optARecommended.textContent = "(recommended)";
  optATitle.append(optATitleText, optARecommended);

  const optALink = document.createElement("a");
  optALink.className = "setup-link";
  optALink.style.cssText = "display:inline-block;margin-bottom:var(--space-3)";
  optALink.href = "https://github.com/settings/personal-access-tokens/new";
  optALink.target = "_blank";
  optALink.rel = "noopener";
  optALink.textContent = "Create token →";

  const optAList = document.createElement("ol");
  optAList.style.cssText =
    "margin:0;padding-left:var(--space-4);font-family:var(--font-body);font-size:var(--text-xs);color:var(--text-secondary);line-height:1.8";

  const optAItems = [
    ["Name it ", "Symphony"],
    ["Repository access → ", "Only select repositories", " → pick repos"],
    ["Permissions → Repository → ", "Contents", " and ", "Pull requests", ": Read and write"],
    ["Generate token"],
  ];
  for (const parts of optAItems) {
    const li = document.createElement("li");
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        const strong = document.createElement("strong");
        strong.textContent = parts[i];
        li.append(strong);
      } else {
        li.append(document.createTextNode(parts[i]));
      }
    }
    optAList.append(li);
  }

  optA.append(optATitle, optALink, optAList);

  const optB = document.createElement("div");
  optB.style.cssText =
    "border:var(--stroke-default) solid var(--border-stitch);padding:var(--space-3);background:var(--bg-muted)";

  const optBTitle = document.createElement("div");
  optBTitle.style.cssText =
    "font-family:var(--font-body);font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-2)";
  optBTitle.textContent = "Classic";

  const optBLink = document.createElement("a");
  optBLink.className = "setup-link";
  optBLink.style.cssText = "display:inline-block;margin-bottom:var(--space-3)";
  optBLink.href = "https://github.com/settings/tokens/new?scopes=repo&description=Symphony+Orchestrator";
  optBLink.target = "_blank";
  optBLink.rel = "noopener";
  optBLink.textContent = "Create token →";

  const optBList = document.createElement("ol");
  optBList.style.cssText =
    "margin:0;padding-left:var(--space-4);font-family:var(--font-body);font-size:var(--text-xs);color:var(--text-secondary);line-height:1.8";

  const optBLi1 = document.createElement("li");
  const optBLi1Text1 = document.createTextNode("Check the ");
  const optBLi1Strong = document.createElement("strong");
  optBLi1Strong.textContent = "repo";
  const optBLi1Text2 = document.createTextNode(" scope");
  optBLi1.append(optBLi1Text1, optBLi1Strong, optBLi1Text2);

  const optBLi2 = document.createElement("li");
  optBLi2.textContent = "Generate token";

  optBList.append(optBLi1, optBLi2);
  optB.append(optBTitle, optBLink, optBList);

  optionWrap.append(optA, optB);

  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.htmlFor = githubTokenInputId;
  label.textContent = "Personal Access Token";

  const validate = document.createElement("button");
  validate.className = "mc-button is-primary";
  validate.type = "button";
  validate.textContent = state.loading ? "Validating…" : "Validate & Save";
  validate.disabled = state.loading || !state.tokenInput;
  validate.addEventListener("click", () => void advanceGithubToken());

  const input = document.createElement("input");
  input.id = githubTokenInputId;
  input.className = "setup-input";
  input.type = "password";
  input.placeholder = "ghp_… or github_pat_…";
  input.value = state.tokenInput;
  input.addEventListener("input", () => {
    state.tokenInput = input.value;
    validate.disabled = state.loading || !state.tokenInput;
  });

  field.append(label, input);
  el.append(titleRow, sub, optionWrap, field);

  if (state.error) {
    el.append(buildSetupError(state.error));
  }

  const actions = document.createElement("div");
  actions.className = "setup-actions";

  const skip = document.createElement("button");
  skip.className = "mc-button is-ghost is-sm";
  skip.type = "button";
  skip.textContent = "Skip for now";
  skip.addEventListener("click", () => {
    state.step = "done";
    state.error = null;
    rerender();
  });

  actions.append(skip, validate);
  el.append(actions);

  return el;
}

async function advanceGithubToken(): Promise<void> {
  if (!state.tokenInput) return;
  setLoading(true);
  state.error = null;
  try {
    const result = await api.postGithubToken(state.tokenInput);
    if (!result.valid) {
      state.error = "Token validation failed — check the token and try again.";
      return;
    }
    state.step = "done";
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    setLoading(false);
  }
}

// ── Done ─────────────────────────────────────────────────────────────────────

function buildFlowDiagram(): HTMLElement {
  const flow = document.createElement("div");
  flow.className = "setup-flow";

  const steps = [
    { icon: "📋", label: "Linear Issue", sub: "Create or tag" },
    { icon: "🎵", label: "Symphony", sub: "Agent works" },
    { icon: "🐙", label: "GitHub PR", sub: "Results delivered" },
  ];

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const step = document.createElement("div");
    step.className = "setup-flow-step";

    const icon = document.createElement("div");
    icon.className = "setup-flow-icon";
    icon.textContent = s.icon;

    const label = document.createElement("div");
    label.className = "setup-flow-label";
    label.textContent = s.label;

    const sub = document.createElement("div");
    sub.className = "setup-flow-sub";
    sub.textContent = s.sub;

    step.append(icon, label, sub);
    flow.append(step);

    if (i < steps.length - 1) {
      const arrow = document.createElement("div");
      arrow.className = "setup-flow-arrow";
      arrow.textContent = "→";
      flow.append(arrow);
    }
  }

  return flow;
}

function buildQuickStartCard(opts: {
  icon: string;
  title: string;
  desc: string;
  buttonText: string;
  loading: boolean;
  created: boolean;
  createdText: string;
  createdLink?: string | null;
  error: string | null;
  onClick: () => void;
}): HTMLElement {
  const card = document.createElement("div");
  card.className = `setup-quick-start-card${opts.loading ? " is-loading" : ""}${opts.created ? " is-success" : ""}`;

  const iconEl = document.createElement("div");
  iconEl.className = "setup-quick-start-icon";
  iconEl.textContent = opts.icon;

  const titleEl = document.createElement("div");
  titleEl.className = "setup-quick-start-title";
  titleEl.textContent = opts.title;

  const descEl = document.createElement("div");
  descEl.className = "setup-quick-start-desc";
  descEl.textContent = opts.desc;

  const body = document.createElement("div");
  body.append(titleEl, descEl);

  if (opts.error) {
    body.append(buildSetupError(opts.error));
  }

  if (opts.created) {
    const success = document.createElement("div");
    success.className = "setup-quick-start-success";
    success.textContent = `✓ ${opts.createdText}`;
    if (opts.createdLink) {
      const link = document.createElement("a");
      link.className = "setup-link";
      link.href = opts.createdLink;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = " View →";
      success.append(link);
    }
    body.append(success);
  } else {
    const btn = document.createElement("button");
    btn.className = "mc-button is-primary is-sm";
    btn.type = "button";
    btn.textContent = opts.loading ? "Creating…" : opts.buttonText;
    btn.disabled = opts.loading;
    btn.addEventListener("click", () => opts.onClick());
    body.append(btn);
  }

  card.append(iconEl, body);
  return card;
}

function buildDoneStep(): HTMLElement {
  const el = document.createElement("div");
  el.className = "setup-done";

  const icon = document.createElement("div");
  icon.className = "setup-done-icon";
  icon.textContent = "✓";
  icon.style.color = "var(--status-running)";

  const title = document.createElement("div");
  title.className = "setup-done-title";
  title.textContent = "You're all set";

  const desc = document.createElement("div");
  desc.className = "setup-done-desc";
  desc.textContent = "Symphony is connected and polling. Here's how it works:";

  const flow = buildFlowDiagram();

  const quickStartLabel = document.createElement("div");
  quickStartLabel.className = "setup-label";
  quickStartLabel.style.marginTop = "var(--space-6)";
  quickStartLabel.textContent = "Quick Start";

  const cards = document.createElement("div");
  cards.className = "setup-quick-start-grid";

  const testIssueCard = buildQuickStartCard({
    icon: "⚡",
    title: "Create a test issue",
    desc: "Creates a Linear issue and moves it to In Progress. Symphony will pick it up within 30 seconds.",
    buttonText: "Create Test Issue",
    loading: state.testIssueLoading,
    created: state.testIssueCreated,
    createdText: state.testIssueIdentifier ? `Created ${state.testIssueIdentifier}` : "Created",
    createdLink: state.testIssueUrl,
    error: state.testIssueError,
    onClick: () => void handleCreateTestIssue(),
  });

  const labelCard = buildQuickStartCard({
    icon: "🏷️",
    title: "Create Symphony label",
    desc: "Adds a symphony label to your Linear team for tagging issues you want Symphony to handle.",
    buttonText: "Create Label",
    loading: state.labelLoading,
    created: state.labelCreated,
    createdText: state.labelName ? `Label "${state.labelName}" ready` : "Created",
    error: state.labelError,
    onClick: () => void handleCreateLabel(),
  });

  cards.append(testIssueCard, labelCard);

  const goBtn = document.createElement("button");
  goBtn.className = "mc-button is-primary";
  goBtn.type = "button";
  goBtn.style.marginTop = "var(--space-6)";
  goBtn.textContent = "Go to Dashboard →";
  goBtn.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("setup:complete"));
    router.navigate("/");
  });

  const divider = document.createElement("hr");
  divider.className = "setup-divider";

  const resetBtn = document.createElement("button");
  resetBtn.className = "mc-button is-ghost is-sm setup-reset-btn";
  resetBtn.type = "button";
  resetBtn.textContent = "Reset & Re-run Setup";
  resetBtn.addEventListener("click", async () => {
    if (!confirm("This will clear all stored secrets (Linear, OpenAI, GitHub keys). Are you sure?")) return;
    resetBtn.disabled = true;
    resetBtn.textContent = "Resetting…";
    try {
      await api.resetSetup();
      state.error = null;
      state.generatedKey = null;
      state.apiKeyInput = "";
      state.apiKeyVerified = false;
      state.projects = [];
      state.selectedProject = null;
      state.teamKey = null;
      state.repoUrlInput = "";
      state.defaultBranchInput = "main";
      state.labelInput = "";
      state.showRepoAdvanced = false;
      state.repoRoutes = [];
      state.tokenInput = "";
      state.openaiKeyInput = "";
      state.authMode = "api_key";
      state.authJsonInput = "";
      state.showManualAuthFallback = false;
      state.testIssueLoading = false;
      state.testIssueCreated = false;
      state.testIssueIdentifier = null;
      state.testIssueUrl = null;
      state.testIssueError = null;
      state.labelLoading = false;
      state.labelCreated = false;
      state.labelName = null;
      state.labelError = null;
      deviceAuthController.clearDeviceAuthState();
      try {
        const status = await api.getSetupStatus();
        if (!status.steps.masterKey.done) {
          state.step = "master-key";
          state.generatedKey = null;
        } else {
          state.generatedKey = "set";
          if (!status.steps.linearProject.done) {
            state.step = "linear-project";
          } else if (!status.steps.repoRoute.done) {
            state.step = "repo-config";
          } else if (!status.steps.openaiKey.done) {
            state.step = "openai-key";
          } else if (!status.steps.githubToken.done) {
            state.step = "github-token";
          } else {
            state.step = "done";
          }
        }
      } catch {
        state.step = "master-key";
      }
      rerender();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      resetBtn.disabled = false;
      resetBtn.textContent = "Reset & Re-run Setup";
    }
  });

  el.append(icon, title, desc, flow, quickStartLabel, cards, goBtn, divider, resetBtn);
  return el;
}

async function handleCreateTestIssue(): Promise<void> {
  state.testIssueLoading = true;
  state.testIssueError = null;
  rerender();
  try {
    const result = await api.createTestIssue();
    state.testIssueCreated = true;
    state.testIssueIdentifier = result.issueIdentifier;
    state.testIssueUrl = result.issueUrl;
  } catch (err) {
    state.testIssueError = err instanceof Error ? err.message : String(err);
  } finally {
    state.testIssueLoading = false;
    rerender();
  }
}

async function handleCreateLabel(): Promise<void> {
  state.labelLoading = true;
  state.labelError = null;
  rerender();
  try {
    const result = await api.createLabel();
    state.labelCreated = true;
    state.labelName = result.labelName;
  } catch (err) {
    state.labelError = err instanceof Error ? err.message : String(err);
  } finally {
    state.labelLoading = false;
    rerender();
  }
}

// ── Main render ──────────────────────────────────────────────────────────────

function buildStepContent(): HTMLElement {
  switch (state.step) {
    case "master-key":
      return buildMasterKeyStep();
    case "linear-project":
      return buildLinearProjectStep();
    case "repo-config":
      return buildRepoConfigStepSetup();
    case "openai-key":
      return buildOpenaiKeyStep();
    case "github-token":
      return buildGithubTokenStep();
    case "done":
      return buildDoneStep();
  }
}

function buildPage(): HTMLElement {
  const wrap = document.createElement("div");

  if (state.step === "master-key") {
    const intro = document.createElement("div");
    intro.className = "setup-intro";

    const introHeading = document.createElement("h2");
    introHeading.className = "setup-intro-heading";
    introHeading.textContent = "Welcome to Symphony";

    const introSub = document.createElement("p");
    introSub.className = "setup-intro-sub";
    introSub.textContent =
      "This takes about 3–5 minutes. You'll connect Symphony to your project tracker and add the credentials it needs.";

    intro.append(introHeading, introSub);
    wrap.append(intro);
  }

  if (state.step !== "done") {
    wrap.append(buildStepIndicator());
  }

  const content = document.createElement("div");
  content.className = "setup-content";
  content.append(buildStepContent());

  wrap.append(content);
  return wrap;
}

export function createSetupPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "setup-page fade-in";
  container = page;
  registerPageCleanup(page, () => {
    deviceAuthController.clearDeviceAuthState();
    container = null;
  });

  // Always start at step 1 — fetch server status only to pre-fill state.
  state.step = "master-key";
  api
    .getSetupStatus()
    .then((status) => {
      if (!status.steps.masterKey.done) {
        if (!state.generatedKey) generateAndSetKey().catch(() => {});
      } else {
        state.generatedKey = state.generatedKey ?? "set";
        rerender();
      }
    })
    .catch(() => {
      if (!state.generatedKey) generateAndSetKey().catch(() => {});
    });

  page.append(buildPage());
  return page;
}
