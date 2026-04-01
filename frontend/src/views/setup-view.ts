import { api } from "../api";
import { router } from "../router";
import type { LinearProject } from "../types";
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
  projects: LinearProject[];
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

const SETUP_STEP_DEFS: ReadonlyArray<{ key: SetupStep; label: string; n: string }> = [
  { key: "master-key", label: "Credentials", n: "1" },
  { key: "linear-project", label: "Linear", n: "2" },
  { key: "repo-config", label: "Repository", n: "3" },
  { key: "openai-key", label: "OpenAI", n: "4" },
  { key: "github-token", label: "GitHub", n: "5" },
];

const SETUP_STEP_ORDER: SetupStep[] = [...SETUP_STEP_DEFS.map((s) => s.key), "done"];

function resolveStepState(stepKey: SetupStep, currentIdx: number): "done" | "active" | "upcoming" {
  const stepIdx = SETUP_STEP_ORDER.indexOf(stepKey);
  if (currentIdx > stepIdx) return "done";
  if (stepKey === state.step) return "active";
  return "upcoming";
}

function buildStepItem(
  stepDef: (typeof SETUP_STEP_DEFS)[number],
  stepState: "done" | "active" | "upcoming",
): HTMLElement {
  const indicator = document.createElement("div");
  indicator.className = `setup-step-indicator is-${stepState} is-clickable`;
  indicator.setAttribute("aria-current", stepState === "active" ? "step" : "false");
  indicator.setAttribute("role", "button");
  indicator.setAttribute("tabindex", "0");

  const targetStep = stepDef.key;
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

  const dot = document.createElement("div");
  dot.className = "setup-step-dot";
  dot.textContent = stepState === "done" ? "\u2713" : stepDef.n;

  /* Delight: pulse the check dot when arriving at the final "done" screen */
  if (stepState === "done" && state.step === "done") {
    dot.classList.add("delight-check");
  }

  const label = document.createElement("span");
  label.className = "setup-step-label";
  label.textContent = stepDef.label;

  indicator.append(dot, label);
  return indicator;
}

function buildStepIndicator(): HTMLElement {
  const currentIdx = SETUP_STEP_ORDER.indexOf(state.step);

  const row = document.createElement("div");
  row.className = "setup-steps";
  row.setAttribute("role", "navigation");
  row.setAttribute(
    "aria-label",
    `Setup progress: step ${Math.min(currentIdx + 1, SETUP_STEP_DEFS.length)} of ${SETUP_STEP_DEFS.length}`,
  );

  for (let i = 0; i < SETUP_STEP_DEFS.length; i++) {
    const stepDef = SETUP_STEP_DEFS[i];
    const stepState = resolveStepState(stepDef.key, currentIdx);
    row.append(buildStepItem(stepDef, stepState));

    if (i < SETUP_STEP_DEFS.length - 1) {
      const connector = document.createElement("div");
      const isFilled = stepState === "done";
      connector.className = `setup-step-connector${isFilled ? " is-filled" : ""}`;
      /* Delight: animate the connector fill when all steps complete */
      if (isFilled && state.step === "done") {
        connector.classList.add("delight-fill");
        connector.style.animationDelay = `${i * 80}ms`;
      }
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
  title.textContent = "Secure your credentials";

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";

  if (keyAlreadySet) {
    // Key was set in a previous session — show confirmation with reconfigure option
    sub.textContent =
      "Risoluto created this encryption key during a previous setup. Keep a backup if you move this machine.";

    const badge = document.createElement("div");
    badge.className = "setup-callout";
    const badgeIcon = document.createTextNode("✓ ");
    const badgeStrong = document.createElement("strong");
    badgeStrong.textContent = "Encryption key is ready. ";
    const badgeText = document.createTextNode("Stored secrets on this machine are still encrypted.");
    badge.append(badgeIcon, badgeStrong, badgeText);

    const actions = document.createElement("div");
    actions.className = "setup-actions";

    const next = document.createElement("button");
    next.className = "mc-button is-primary";
    next.type = "button";
    next.textContent = "Continue \u2192";
    next.addEventListener("click", () => advanceMasterKey());
    actions.append(next);

    const dangerZone = document.createElement("div");
    dangerZone.className = "setup-danger-zone";

    const reconfigure = document.createElement("button");
    reconfigure.className = "mc-button is-ghost is-sm";
    reconfigure.type = "button";
    reconfigure.textContent = state.loading ? "Resetting\u2026" : "Reset all credentials";
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

    dangerZone.append(reconfigure);

    if (state.error) {
      el.append(title, sub, badge, buildSetupError(state.error), actions, dangerZone);
    } else {
      el.append(title, sub, badge, actions, dangerZone);
    }
    return el;
  }

  // Key was just generated — show it so the user can copy
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

  const copyBtn = document.createElement("button");
  copyBtn.className = "mc-button is-ghost is-sm";
  copyBtn.type = "button";
  copyBtn.textContent = "Copy key";
  copyBtn.addEventListener("click", () => {
    if (state.generatedKey) {
      navigator.clipboard.writeText(state.generatedKey).catch(() => {});
      copyBtn.textContent = "Copied";
      setTimeout(() => {
        copyBtn.textContent = "Copy key";
      }, 1500);
    }
  });

  keyDisplay.append(keyValue, copyBtn);

  const actions = document.createElement("div");
  actions.className = "setup-actions";

  const regen = document.createElement("button");
  regen.className = "mc-button is-ghost is-sm setup-actions-secondary";
  regen.type = "button";
  regen.textContent = "Generate new key";
  regen.disabled = state.loading;
  regen.addEventListener("click", () => {
    generateAndSetKey().catch(() => {});
  });

  const next = document.createElement("button");
  next.className = "mc-button is-primary";
  next.type = "button";
  next.textContent = state.loading ? "Saving\u2026" : "Continue \u2192";
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
  badge.className = "setup-key-status";

  if (state.loading) {
    badge.textContent = "Checking…";
    badge.dataset.state = "checking";
    badge.hidden = false;
  } else if (state.apiKeyVerified) {
    badge.textContent = "Connected";
    badge.dataset.state = "connected";
    badge.hidden = false;
  } else if (state.error) {
    badge.textContent = "Needs attention";
    badge.dataset.state = "error";
    badge.hidden = false;
  } else {
    badge.textContent = "";
    badge.dataset.state = "idle";
    badge.hidden = true;
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
    name.textContent = p.name;

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

  const titleRow = buildTitleWithBadge("Connect Linear", "is-required", "Required");

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  const subText = document.createTextNode(
    "Enter your Linear API key, then choose the project Risoluto should follow. ",
  );
  const subLink = document.createElement("a");
  subLink.className = "setup-link";
  subLink.href = "https://linear.app/settings/account/security/api-keys/new";
  subLink.target = "_blank";
  subLink.rel = "noopener";
  subLink.textContent = "Create a Linear API key →";
  sub.append(subText, subLink);

  const callout = document.createElement("div");
  callout.className = "setup-callout";
  const calloutText1 = document.createTextNode("When creating the key, enable ");
  const readStrong = document.createElement("strong");
  readStrong.textContent = "Read";
  const calloutText2 = document.createTextNode(" and ");
  const writeStrong = document.createElement("strong");
  writeStrong.textContent = "Write";
  const calloutText3 = document.createTextNode(" access and select ");
  const allTeamsStrong = document.createElement("strong");
  allTeamsStrong.textContent = "All teams you have access to";
  const calloutText4 = document.createTextNode(".");
  callout.append(calloutText1, readStrong, calloutText2, writeStrong, calloutText3, allTeamsStrong, calloutText4);

  // ── API key input row ──
  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.htmlFor = apiKeyInputId;
  label.textContent = "Linear API key";

  const inputRow = document.createElement("div");
  inputRow.className = "setup-input-row";

  const statusBadge = document.createElement("div");
  statusBadge.className = "setup-key-status";
  applyStatusBadge(statusBadge);

  const verifyBtn = document.createElement("button");
  verifyBtn.className = "mc-button is-primary is-sm setup-verify-btn";
  verifyBtn.type = "button";
  verifyBtn.textContent = state.loading ? "Checking…" : state.apiKeyVerified ? "Check again" : "Check key";
  verifyBtn.disabled = state.loading || !state.apiKeyInput;
  verifyBtn.addEventListener("click", () => {
    loadLinearProjects().catch(() => {});
  });

  const input = document.createElement("input");
  input.id = apiKeyInputId;
  input.className = "setup-input setup-input-flex";
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
      successBanner.className = "setup-callout setup-callout-success";

      const strong = document.createElement("strong");
      strong.textContent = `Project "${state.createdProjectName}" created. `;
      const text = document.createTextNode("It's selected below and ready to use.");
      successBanner.append(strong, text);

      if (state.createdProjectUrl) {
        const link = document.createElement("a");
        link.className = "setup-link";
        link.href = state.createdProjectUrl;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = " Open in Linear →";
        successBanner.append(link);
      }
      el.append(successBanner);
    }

    const gridLabel = document.createElement("div");
    gridLabel.id = projectGridLabelId;
    gridLabel.className = "setup-label setup-section-label";
    gridLabel.textContent = "Choose a project";
    el.append(gridLabel, buildProjectGrid(projectGridLabelId));
  } else if (state.apiKeyVerified && state.projects.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "setup-callout setup-callout-muted";
    const emptyStrong = document.createElement("strong");
    emptyStrong.textContent = "No projects matched this key yet. ";
    const emptyText = document.createTextNode("Create one below or in Linear directly.");
    emptyMsg.append(emptyStrong, emptyText);

    const createRow = document.createElement("div");
    createRow.className = "setup-create-project-row";

    const nameField = document.createElement("div");
    nameField.className = "setup-field is-grow";

    const nameLabel = document.createElement("label");
    nameLabel.className = "setup-label";
    nameLabel.htmlFor = createProjectNameInputId;
    nameLabel.textContent = "Create a new project";

    const nameInput = document.createElement("input");
    nameInput.id = createProjectNameInputId;
    nameInput.className = "setup-input";
    nameInput.placeholder = "Project name (e.g. My App)";

    const createBtn = document.createElement("button");
    createBtn.className = "mc-button is-primary is-sm";
    createBtn.type = "button";
    createBtn.textContent = "Create project";
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
  skip.className = "mc-button is-ghost is-sm setup-actions-secondary";
  skip.type = "button";
  skip.textContent = "Skip this step";
  skip.addEventListener("click", () => {
    state.step = "github-token";
    state.error = null;
    rerender();
  });

  const next = document.createElement("button");
  next.className = "mc-button is-primary";
  next.type = "button";
  next.textContent = state.loading ? "Saving\u2026" : "Continue \u2192";
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
    state.teamKey = selectedProj?.teamKey ?? null;
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
    onDetectDefaultBranch: async (repoUrl) => {
      try {
        const result = await api.detectDefaultBranch(repoUrl);
        return result.defaultBranch;
      } catch {
        return null;
      }
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
        state.error = "That OpenAI key wasn't accepted. Double-check it and try again.";
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
    "Add a token so Risoluto can create pull requests automatically. You can skip this and add it later from Settings → Credentials.";

  const optionWrap = document.createElement("div");
  optionWrap.className = "setup-token-options";

  optionWrap.append(
    buildGithubTokenOptionCard({
      title: "Fine-grained token",
      badge: "Recommended",
      href: "https://github.com/settings/personal-access-tokens/new",
      steps: [
        ["Give it a name: ", "Risoluto"],
        ["Repository access: ", "Only select repositories"],
        ["Permissions: Repository → ", "Contents", " and ", "Pull requests", ": Read and write"],
        ["Create the token"],
      ],
    }),
    buildGithubTokenOptionCard({
      title: "Classic token",
      href: "https://github.com/settings/tokens/new?scopes=repo&description=Risoluto",
      steps: [["Enable the ", "repo", " scope"], ["Create the token"]],
    }),
  );

  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.htmlFor = githubTokenInputId;
  label.textContent = "GitHub access token";

  const validate = document.createElement("button");
  validate.className = "mc-button is-primary";
  validate.type = "button";
  validate.textContent = state.loading ? "Saving…" : "Save and continue";
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
  skip.className = "mc-button is-ghost is-sm setup-actions-secondary";
  skip.type = "button";
  skip.textContent = "Skip this step";
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
      state.error = "That GitHub token wasn't accepted. Double-check it and try again.";
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
    { marker: "01", label: "Signal in Linear", sub: "Move an issue into progress or tag it for Risoluto." },
    { marker: "02", label: "Risoluto executes", sub: "The agent pulls context, works the task, and records progress." },
    { marker: "03", label: "Review the output", sub: "Commits and pull requests land when GitHub access is enabled." },
  ];

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const step = document.createElement("div");
    step.className = "setup-flow-step";

    const marker = document.createElement("div");
    marker.className = "setup-flow-marker";
    marker.textContent = s.marker;

    const label = document.createElement("div");
    label.className = "setup-flow-label";
    label.textContent = s.label;

    const sub = document.createElement("div");
    sub.className = "setup-flow-sub";
    sub.textContent = s.sub;

    step.append(marker, label, sub);
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
  kicker: string;
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
  card.className = `setup-quick-start-card${opts.loading ? " is-loading" : ""}${opts.created ? " is-success delight-confirmed" : ""}`;

  const kicker = document.createElement("div");
  kicker.className = "setup-quick-start-kicker";
  kicker.textContent = opts.kicker;

  const titleEl = document.createElement("div");
  titleEl.className = "setup-quick-start-title";
  titleEl.textContent = opts.title;

  const descEl = document.createElement("div");
  descEl.className = "setup-quick-start-desc";
  descEl.textContent = opts.desc;

  const body = document.createElement("div");
  body.className = "setup-quick-start-body";
  body.append(kicker, titleEl, descEl);

  if (opts.error) {
    body.append(buildSetupError(opts.error));
  }

  if (opts.created) {
    const success = document.createElement("div");
    success.className = "setup-quick-start-success";
    success.textContent = `${opts.createdText}`;
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

  card.append(body);
  return card;
}

function buildDoneStep(): HTMLElement {
  const el = document.createElement("div");
  el.className = "setup-done delight-entered";

  const icon = document.createElement("div");
  icon.className = "setup-done-icon";
  icon.textContent = "Ready";

  const title = document.createElement("div");
  title.className = "setup-done-title";
  title.textContent = "Setup complete";

  const desc = document.createElement("div");
  desc.className = "setup-done-desc";
  desc.textContent = "Risoluto is connected and polling. Use one of these actions to verify the loop end to end.";

  const flow = buildFlowDiagram();

  const quickStartLabel = document.createElement("div");
  quickStartLabel.className = "setup-label setup-section-label";
  quickStartLabel.textContent = "First actions";

  const cards = document.createElement("div");
  cards.className = "setup-quick-start-grid";

  const testIssueCard = buildQuickStartCard({
    kicker: "Verification",
    title: "Create a practice issue",
    desc: "Create a Linear issue, move it into progress, and watch Risoluto pick it up on the next poll.",
    buttonText: "Create practice issue",
    loading: state.testIssueLoading,
    created: state.testIssueCreated,
    createdText: state.testIssueIdentifier ? `Created ${state.testIssueIdentifier}` : "Created",
    createdLink: state.testIssueUrl,
    error: state.testIssueError,
    onClick: () => void handleCreateTestIssue(),
  });

  const labelCard = buildQuickStartCard({
    kicker: "Team setup",
    title: "Create the Risoluto label",
    desc: "Add a shared label so your team has a clear way to mark work that Risoluto should handle.",
    buttonText: "Create label",
    loading: state.labelLoading,
    created: state.labelCreated,
    createdText: state.labelName ? `Label "${state.labelName}" ready` : "Created",
    error: state.labelError,
    onClick: () => void handleCreateLabel(),
  });

  cards.append(testIssueCard, labelCard);

  const goBtn = document.createElement("button");
  goBtn.className = "mc-button is-primary setup-done-action";
  goBtn.type = "button";
  goBtn.textContent = "Open dashboard →";
  goBtn.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("setup:complete"));
    router.navigate("/");
  });

  const divider = document.createElement("hr");
  divider.className = "setup-divider";

  const resetBtn = document.createElement("button");
  resetBtn.className = "mc-button is-ghost is-sm setup-reset-btn";
  resetBtn.type = "button";
  resetBtn.textContent = "Reset setup";
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
    } catch (error) {
      console.error("Setup reset failed:", error);
      alert("We couldn't reset setup. Please try again.");
      resetBtn.disabled = false;
      resetBtn.textContent = "Reset setup";
    }
  });

  el.append(icon, title, desc, flow, quickStartLabel, cards, goBtn, divider, resetBtn);
  return el;
}

function buildGithubTokenOptionCard(opts: {
  title: string;
  badge?: string;
  href: string;
  steps: string[][];
}): HTMLElement {
  const card = document.createElement("div");
  card.className = "setup-token-option";

  const titleRow = document.createElement("div");
  titleRow.className = "setup-token-option-title";
  titleRow.textContent = opts.title;

  if (opts.badge) {
    const badge = document.createElement("span");
    badge.className = "setup-token-option-badge";
    badge.textContent = opts.badge;
    titleRow.append(badge);
  }

  const link = document.createElement("a");
  link.className = "setup-link setup-token-option-link";
  link.href = opts.href;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Create a token →";

  const list = document.createElement("ol");
  list.className = "setup-token-option-list";

  for (const parts of opts.steps) {
    const item = document.createElement("li");
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        const strong = document.createElement("strong");
        strong.textContent = parts[i];
        item.append(strong);
      } else {
        item.append(document.createTextNode(parts[i]));
      }
    }
    list.append(item);
  }

  card.append(titleRow, link, list);
  return card;
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

    const introHeading = document.createElement("h1");
    introHeading.className = "setup-intro-heading";
    introHeading.textContent = "Welcome to Risoluto";

    const introSub = document.createElement("p");
    introSub.className = "setup-intro-sub";
    introSub.textContent =
      "This takes about 3–5 minutes. You'll connect Linear, set up OpenAI access, and add any optional delivery settings.";

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
