import { api } from "../api";
import { router } from "../router";
import type { LinearProject } from "../types";
import { registerPageCleanup } from "../utils/page";
import { createSingleFlight } from "../utils/single-flight";
import { buildMasterKeyStep, type MasterKeyStepActions, type MasterKeyStepState } from "./setup-master-key-step";
import { buildLinearProjectStep, type LinearStepActions, type LinearStepState } from "./setup-linear-step";
import { buildRepoConfigStep, type RepoConfigStepActions, type RepoConfigStepState } from "./setup-repo-step";
import { createSetupDeviceAuthController } from "./setup-openai-controller";
import {
  buildOpenaiKeyStep as buildOpenaiKeyStepContent,
  type DeviceAuthStatus,
  type OpenaiAuthMode,
  type OpenaiSetupStepState,
} from "./setup-openai-step";
import {
  buildGithubTokenStep as buildGithubTokenStepContent,
  type GithubStepActions,
  type GithubStepState,
} from "./setup-github-step";
import { buildDoneStep as buildDoneStepContent, type DoneStepActions, type DoneStepState } from "./setup-done-step";

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
  providerNameInput: string;
  providerBaseUrlInput: string;
  providerTokenInput: string;
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
  providerNameInput: "",
  providerBaseUrlInput: "",
  providerTokenInput: "",
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
  const stepIdx = SETUP_STEP_ORDER.findIndex((s) => s === stepKey);
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
  const currentIdx = SETUP_STEP_ORDER.findIndex((s) => s === state.step);

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

function buildMasterKeyStepSetup(): HTMLElement {
  const masterKeyState: MasterKeyStepState = {
    loading: state.loading,
    error: state.error,
    generatedKey: state.generatedKey,
  };

  const masterKeyActions: MasterKeyStepActions = {
    onAdvance: () => advanceMasterKey(),
    onGenerateKey: () => {
      generateAndSetKey().catch(() => {});
    },
    onResetSetup: () => {
      if (
        !confirm(
          "This will clear ALL stored secrets (Linear, OpenAI, GitHub keys) and generate a new encryption key. You will need to re-enter all credentials.\n\nAre you sure?",
        )
      )
        return;
      state.loading = true;
      state.error = null;
      rerender();
      api
        .resetSetup()
        .then(async () => {
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
          state.providerNameInput = "";
          state.providerBaseUrlInput = "";
          state.providerTokenInput = "";
          await generateAndSetKey();
        })
        .catch((err: unknown) => {
          state.error = err instanceof Error ? err.message : String(err);
          state.loading = false;
          rerender();
        });
    },
  };

  return buildMasterKeyStep(masterKeyState, masterKeyActions);
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

function buildLinearProjectStepSetup(): HTMLElement {
  const linearStepState: LinearStepState = {
    loading: state.loading,
    error: state.error,
    apiKeyInput: state.apiKeyInput,
    apiKeyVerified: state.apiKeyVerified,
    projects: state.projects,
    selectedProject: state.selectedProject,
    createdProjectName: state.createdProjectName,
    createdProjectUrl: state.createdProjectUrl,
  };

  const linearStepActions: LinearStepActions = {
    onApiKeyInput: (value) => {
      state.apiKeyInput = value;
      if (state.apiKeyVerified) {
        state.apiKeyVerified = false;
        state.projects = [];
        state.selectedProject = null;
        rerender();
      }
    },
    onVerifyKey: () => {
      loadLinearProjects().catch(() => {});
    },
    onSelectProject: (slugId) => {
      state.selectedProject = slugId;
      rerender();
    },
    onCreateProject: (name) => {
      state.loading = true;
      state.error = null;
      rerender();
      api
        .createProject(name)
        .then((result) => {
          state.projects = [result.project];
          state.selectedProject = result.project.slugId;
          state.loading = false;
          state.error = null;
          state.createdProjectUrl = result.project.url;
          state.createdProjectName = result.project.name;
          rerender();
        })
        .catch((err: unknown) => {
          state.error = err instanceof Error ? err.message : String(err);
          state.loading = false;
          rerender();
        });
    },
    onAdvance: () => {
      advanceLinearProject().catch(() => {});
    },
    onSkip: () => {
      state.step = "github-token";
      state.error = null;
      rerender();
    },
  };

  return buildLinearProjectStep(linearStepState, linearStepActions);
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
    providerNameInput: state.providerNameInput,
    providerBaseUrlInput: state.providerBaseUrlInput,
    providerTokenInput: state.providerTokenInput,
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
    onProviderNameInput: (value) => {
      state.providerNameInput = value;
    },
    onProviderBaseUrlInput: (value) => {
      state.providerBaseUrlInput = value;
    },
    onProviderTokenInput: (value) => {
      state.providerTokenInput = value;
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

async function submitApiKeyAuth(): Promise<boolean> {
  if (!state.openaiKeyInput) {
    return false;
  }

  const result = await api.postOpenaiKey({ key: state.openaiKeyInput });
  if (result.valid) {
    return true;
  }

  state.error = "That OpenAI key wasn't accepted. Double-check it and try again.";
  return false;
}

async function submitProxyProviderAuth(): Promise<boolean> {
  if (!state.providerBaseUrlInput || !state.providerTokenInput) {
    return false;
  }

  const result = await api.postOpenaiKey({
    key: state.providerTokenInput,
    provider: {
      name: state.providerNameInput.trim() || undefined,
      baseUrl: state.providerBaseUrlInput.trim(),
    },
  });
  if (result.valid) {
    return true;
  }

  state.error = "That provider endpoint or token wasn't accepted. Double-check both values and try again.";
  return false;
}

async function submitManualAuth(): Promise<boolean> {
  if (!state.authJsonInput) {
    return false;
  }

  await api.postCodexAuth(state.authJsonInput);
  return true;
}

async function submitOpenaiAuthByMode(): Promise<boolean> {
  switch (state.authMode) {
    case "api_key":
      return submitApiKeyAuth();
    case "proxy_provider":
      return submitProxyProviderAuth();
    default:
      return submitManualAuth();
  }
}

async function advanceOpenaiAuth(): Promise<void> {
  setLoading(true);
  state.error = null;
  try {
    const didAdvance = await submitOpenaiAuthByMode();
    if (!didAdvance) {
      return;
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

function buildGithubTokenStepSetup(): HTMLElement {
  const githubState: GithubStepState = {
    loading: state.loading,
    error: state.error,
    tokenInput: state.tokenInput,
  };

  const githubActions: GithubStepActions = {
    onTokenInput: (value) => {
      state.tokenInput = value;
    },
    onAdvance: () => {
      void advanceGithubToken();
    },
    onSkip: () => {
      state.step = "done";
      state.error = null;
      rerender();
    },
  };

  return buildGithubTokenStepContent(githubState, githubActions);
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

async function handleDoneReset(): Promise<void> {
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
    await api.resetSetup();
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
    rerender();
  }
}

function buildDoneStepSetup(): HTMLElement {
  const doneState: DoneStepState = {
    testIssueLoading: state.testIssueLoading,
    testIssueCreated: state.testIssueCreated,
    testIssueIdentifier: state.testIssueIdentifier,
    testIssueUrl: state.testIssueUrl,
    testIssueError: state.testIssueError,
    labelLoading: state.labelLoading,
    labelCreated: state.labelCreated,
    labelName: state.labelName,
    labelError: state.labelError,
  };

  const doneActions: DoneStepActions = {
    onCreateTestIssue: () => {
      void handleCreateTestIssue();
    },
    onCreateLabel: () => {
      void handleCreateLabel();
    },
    onOpenDashboard: () => {
      window.dispatchEvent(new CustomEvent("setup:complete"));
      router.navigate("/");
    },
    onResetSetup: () => {
      if (!confirm("This will clear all stored secrets (Linear, OpenAI, GitHub keys). Are you sure?")) return;
      void handleDoneReset();
    },
  };

  return buildDoneStepContent(doneState, doneActions);
}

// ── Main render ──────────────────────────────────────────────────────────────

function buildStepContent(): HTMLElement {
  switch (state.step) {
    case "master-key":
      return buildMasterKeyStepSetup();
    case "linear-project":
      return buildLinearProjectStepSetup();
    case "repo-config":
      return buildRepoConfigStepSetup();
    case "openai-key":
      return buildOpenaiKeyStep();
    case "github-token":
      return buildGithubTokenStepSetup();
    case "done":
      return buildDoneStepSetup();
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
