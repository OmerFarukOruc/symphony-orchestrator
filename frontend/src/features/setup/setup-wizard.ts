import { api } from "../../api";
import { router } from "../../router";
import type { LinearProject, SetupStatus } from "../../types/setup";
import { createSingleFlight } from "../../utils/single-flight";
import { createSetupDeviceAuthController } from "../../views/setup-openai-controller";
import type { DeviceAuthStatus, OpenaiAuthMode } from "../../views/setup-openai-step";

export type SetupStep = "master-key" | "linear-project" | "repo-config" | "openai-key" | "github-token" | "done";

export interface SetupState {
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

export const SETUP_STEP_DEFS: ReadonlyArray<{ key: SetupStep; label: string; n: string }> = [
  { key: "master-key", label: "Credentials", n: "1" },
  { key: "linear-project", label: "Linear", n: "2" },
  { key: "repo-config", label: "Repository", n: "3" },
  { key: "openai-key", label: "OpenAI", n: "4" },
  { key: "github-token", label: "GitHub", n: "5" },
];

export const SETUP_STEP_ORDER: SetupStep[] = [...SETUP_STEP_DEFS.map((step) => step.key), "done"];

type SetupApi = typeof api;

interface SetupWizardDeps {
  api: SetupApi;
  router: Pick<typeof router, "navigate">;
  confirm: (message: string) => boolean;
  alert: (message: string) => void;
  dispatchEvent: (event: Event) => boolean;
}

interface SetupWizardOptions {
  rerender: () => void;
  deps?: Partial<SetupWizardDeps>;
}

export interface SetupWizard {
  state: SetupState;
  initialize: () => void;
  dispose: () => void;
  navigateToStep: (step: SetupStep) => void;
  masterKey: {
    advance: () => void;
    generateKey: () => Promise<void>;
    resetSetup: () => Promise<void>;
  };
  linearProject: {
    setApiKeyInput: (value: string) => void;
    verifyKey: () => Promise<void>;
    selectProject: (slugId: string) => void;
    createProject: (name: string) => Promise<void>;
    advance: () => Promise<void>;
    skip: () => void;
  };
  repoConfig: {
    setRepoUrlInput: (value: string) => void;
    setDefaultBranchInput: (value: string) => void;
    setLabelInput: (value: string) => void;
    toggleAdvanced: () => void;
    save: () => Promise<void>;
    skip: () => void;
    deleteRoute: (index: number) => Promise<void>;
    detectDefaultBranch: (repoUrl: string) => Promise<string | null>;
  };
  openai: {
    selectAuthMode: (mode: OpenaiAuthMode) => void;
    setOpenaiKeyInput: (value: string) => void;
    setProviderNameInput: (value: string) => void;
    setProviderBaseUrlInput: (value: string) => void;
    setProviderTokenInput: (value: string) => void;
    setAuthJsonInput: (value: string) => void;
    startDeviceAuth: () => Promise<void>;
    cancelDeviceAuth: () => Promise<void>;
    toggleManualAuthFallback: () => void;
    advance: () => Promise<void>;
    skip: () => void;
    getRemainingSeconds: () => number;
  };
  github: {
    setTokenInput: (value: string) => void;
    advance: () => Promise<void>;
    skip: () => void;
  };
  done: {
    createTestIssue: () => Promise<void>;
    createLabel: () => Promise<void>;
    openDashboard: () => void;
    resetSetup: () => Promise<void>;
  };
}

const DEFAULT_STATE: SetupState = {
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

function createSetupState(): SetupState {
  return {
    ...DEFAULT_STATE,
    projects: [],
    repoRoutes: [],
  };
}

function applySetupStatus(state: SetupState, status: SetupStatus): void {
  if (!status.steps.masterKey.done) {
    state.step = "master-key";
    state.generatedKey = null;
    return;
  }

  state.generatedKey = state.generatedKey ?? "set";
  if (!status.steps.linearProject.done) {
    state.step = "linear-project";
    return;
  }
  if (!status.steps.repoRoute.done) {
    state.step = "repo-config";
    return;
  }
  if (!status.steps.openaiKey.done) {
    state.step = "openai-key";
    return;
  }
  if (!status.steps.githubToken.done) {
    state.step = "github-token";
    return;
  }
  state.step = "done";
}

export function createSetupWizard(options: SetupWizardOptions): SetupWizard {
  const deps: SetupWizardDeps = {
    api,
    router,
    confirm: (message) => window.confirm(message),
    alert: (message) => window.alert(message),
    dispatchEvent: (event) => window.dispatchEvent(event),
    ...options.deps,
  };

  const state = createSetupState();

  const rerender = (): void => {
    options.rerender();
  };

  const setLoading = (loading: boolean): void => {
    state.loading = loading;
    rerender();
  };

  const clearSetupProgress = (): void => {
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
    state.providerNameInput = "";
    state.providerBaseUrlInput = "";
    state.providerTokenInput = "";
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
    state.createdProjectUrl = null;
    state.createdProjectName = null;
  };

  const moveToGithubStep = (): void => {
    deviceAuthController.clearDeviceAuthState();
    state.error = null;
    state.step = "github-token";
    rerender();
  };

  const deviceAuthController = createSetupDeviceAuthController(state, {
    rerender,
    moveToGithubStep,
  });

  const generateAndSetKey = createSingleFlight(async (): Promise<void> => {
    setLoading(true);
    state.error = null;
    try {
      const result = await deps.api.postMasterKey();
      state.generatedKey = result.key;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("already")) {
        state.generatedKey = "set";
      } else {
        state.error = message;
      }
    } finally {
      setLoading(false);
    }
  });

  const loadLinearProjects = async (): Promise<void> => {
    if (!state.apiKeyInput) {
      return;
    }

    setLoading(true);
    state.error = null;
    state.apiKeyVerified = false;
    try {
      await deps.api.postSecret("LINEAR_API_KEY", state.apiKeyInput);
      const result = await deps.api.getLinearProjects();
      state.projects = result.projects;
      state.apiKeyVerified = true;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      state.projects = [];
    } finally {
      setLoading(false);
    }
  };

  const advanceLinearProject = async (): Promise<void> => {
    if (!state.selectedProject) {
      return;
    }

    setLoading(true);
    state.error = null;
    try {
      await deps.api.postLinearProject(state.selectedProject);
      const selectedProject = state.projects.find((project) => project.slugId === state.selectedProject);
      state.teamKey = selectedProject?.teamKey ?? null;
      state.step = "repo-config";
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      setLoading(false);
    }
  };

  const advanceRepoConfig = async (): Promise<void> => {
    if (!state.repoUrlInput.trim()) {
      return;
    }

    setLoading(true);
    state.error = null;
    try {
      const identifierPrefix = state.teamKey ? state.teamKey.toUpperCase() : "DEFAULT";
      await deps.api.postRepoRoute({
        repoUrl: state.repoUrlInput.trim(),
        defaultBranch: state.defaultBranchInput.trim() || "main",
        identifierPrefix,
        label: state.labelInput.trim() || undefined,
      });
      const result = await deps.api.getRepoRoutes();
      state.repoRoutes = result.routes;
      state.step = "openai-key";
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      setLoading(false);
    }
  };

  const deleteRepoRoute = async (index: number): Promise<void> => {
    setLoading(true);
    state.error = null;
    try {
      const result = await deps.api.deleteRepoRoute(index);
      state.repoRoutes = result.routes;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      setLoading(false);
      rerender();
    }
  };

  const submitApiKeyAuth = async (): Promise<boolean> => {
    if (!state.openaiKeyInput) {
      return false;
    }

    const result = await deps.api.postOpenaiKey({ key: state.openaiKeyInput });
    if (result.valid) {
      return true;
    }

    state.error = "That OpenAI key wasn't accepted. Double-check it and try again.";
    return false;
  };

  const submitProxyProviderAuth = async (): Promise<boolean> => {
    if (!state.providerBaseUrlInput || !state.providerTokenInput) {
      return false;
    }

    const result = await deps.api.postOpenaiKey({
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
  };

  const submitManualAuth = async (): Promise<boolean> => {
    if (!state.authJsonInput) {
      return false;
    }

    await deps.api.postCodexAuth(state.authJsonInput);
    return true;
  };

  const submitOpenaiAuthByMode = async (): Promise<boolean> => {
    switch (state.authMode) {
      case "api_key":
        return submitApiKeyAuth();
      case "proxy_provider":
        return submitProxyProviderAuth();
      default:
        return submitManualAuth();
    }
  };

  const advanceOpenaiAuth = async (): Promise<void> => {
    setLoading(true);
    state.error = null;
    try {
      const didAdvance = await submitOpenaiAuthByMode();
      if (!didAdvance) {
        return;
      }

      moveToGithubStep();
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      setLoading(false);
    }
  };

  const advanceGithubToken = async (): Promise<void> => {
    if (!state.tokenInput) {
      return;
    }

    setLoading(true);
    state.error = null;
    try {
      const result = await deps.api.postGithubToken(state.tokenInput);
      if (!result.valid) {
        state.error = "That GitHub token wasn't accepted. Double-check it and try again.";
        return;
      }
      state.step = "done";
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      setLoading(false);
    }
  };

  const createTestIssue = async (): Promise<void> => {
    state.testIssueLoading = true;
    state.testIssueError = null;
    rerender();
    try {
      const result = await deps.api.createTestIssue();
      state.testIssueCreated = true;
      state.testIssueIdentifier = result.issueIdentifier;
      state.testIssueUrl = result.issueUrl;
    } catch (error) {
      state.testIssueError = error instanceof Error ? error.message : String(error);
    } finally {
      state.testIssueLoading = false;
      rerender();
    }
  };

  const createLabel = async (): Promise<void> => {
    state.labelLoading = true;
    state.labelError = null;
    rerender();
    try {
      const result = await deps.api.createLabel();
      state.labelCreated = true;
      state.labelName = result.labelName;
    } catch (error) {
      state.labelError = error instanceof Error ? error.message : String(error);
    } finally {
      state.labelLoading = false;
      rerender();
    }
  };

  const resetFromDone = async (): Promise<void> => {
    clearSetupProgress();
    deviceAuthController.clearDeviceAuthState();

    try {
      await deps.api.resetSetup();
      try {
        const status = await deps.api.getSetupStatus();
        applySetupStatus(state, status);
      } catch {
        state.step = "master-key";
      }
      rerender();
    } catch (error) {
      console.error("Setup reset failed:", error);
      deps.alert("We couldn't reset setup. Please try again.");
      rerender();
    }
  };

  return {
    state,
    initialize() {
      state.step = "master-key";
      deps.api
        .getSetupStatus()
        .then((status) => {
          if (!status.steps.masterKey.done) {
            if (!state.generatedKey) {
              void generateAndSetKey();
            }
            return;
          }

          state.generatedKey = state.generatedKey ?? "set";
          rerender();
        })
        .catch(() => {
          if (!state.generatedKey) {
            void generateAndSetKey();
          }
        });
    },
    dispose() {
      deviceAuthController.clearDeviceAuthState();
    },
    navigateToStep(step) {
      state.step = step;
      state.error = null;
      rerender();
    },
    masterKey: {
      advance() {
        if (!state.generatedKey) {
          return;
        }
        state.step = "linear-project";
        state.error = null;
        rerender();
      },
      generateKey() {
        return generateAndSetKey();
      },
      async resetSetup() {
        if (
          !deps.confirm(
            "This will clear ALL stored secrets (Linear, OpenAI, GitHub keys) and generate a new encryption key. You will need to re-enter all credentials.\n\nAre you sure?",
          )
        ) {
          return;
        }

        state.loading = true;
        state.error = null;
        rerender();
        try {
          await deps.api.resetSetup();
          clearSetupProgress();
          await generateAndSetKey();
        } catch (error) {
          state.error = error instanceof Error ? error.message : String(error);
          state.loading = false;
          rerender();
        }
      },
    },
    linearProject: {
      setApiKeyInput(value) {
        state.apiKeyInput = value;
        if (state.apiKeyVerified) {
          state.apiKeyVerified = false;
          state.projects = [];
          state.selectedProject = null;
          rerender();
        }
      },
      verifyKey() {
        return loadLinearProjects();
      },
      selectProject(slugId) {
        state.selectedProject = slugId;
        rerender();
      },
      async createProject(name) {
        state.loading = true;
        state.error = null;
        rerender();
        try {
          const result = await deps.api.createProject(name);
          state.projects = [result.project];
          state.selectedProject = result.project.slugId;
          state.createdProjectUrl = result.project.url;
          state.createdProjectName = result.project.name;
          state.loading = false;
          state.error = null;
          rerender();
        } catch (error) {
          state.error = error instanceof Error ? error.message : String(error);
          state.loading = false;
          rerender();
        }
      },
      advance() {
        return advanceLinearProject();
      },
      skip() {
        state.step = "github-token";
        state.error = null;
        rerender();
      },
    },
    repoConfig: {
      setRepoUrlInput(value) {
        state.repoUrlInput = value;
      },
      setDefaultBranchInput(value) {
        state.defaultBranchInput = value;
      },
      setLabelInput(value) {
        state.labelInput = value;
      },
      toggleAdvanced() {
        state.showRepoAdvanced = !state.showRepoAdvanced;
        rerender();
      },
      save() {
        return advanceRepoConfig();
      },
      skip() {
        state.step = "openai-key";
        state.error = null;
        rerender();
      },
      deleteRoute(index) {
        return deleteRepoRoute(index);
      },
      async detectDefaultBranch(repoUrl) {
        try {
          const result = await deps.api.detectDefaultBranch(repoUrl);
          return result.defaultBranch;
        } catch {
          return null;
        }
      },
    },
    openai: {
      selectAuthMode(mode) {
        deviceAuthController.selectOpenaiAuthMode(mode);
      },
      setOpenaiKeyInput(value) {
        state.openaiKeyInput = value;
      },
      setProviderNameInput(value) {
        state.providerNameInput = value;
      },
      setProviderBaseUrlInput(value) {
        state.providerBaseUrlInput = value;
      },
      setProviderTokenInput(value) {
        state.providerTokenInput = value;
      },
      setAuthJsonInput(value) {
        state.authJsonInput = value;
        rerender();
      },
      startDeviceAuth() {
        return deviceAuthController.startDeviceAuthFlow();
      },
      cancelDeviceAuth() {
        return deviceAuthController.cancelDeviceAuth();
      },
      toggleManualAuthFallback() {
        state.showManualAuthFallback = !state.showManualAuthFallback;
        rerender();
      },
      advance() {
        return advanceOpenaiAuth();
      },
      skip() {
        deviceAuthController.clearDeviceAuthState();
        state.step = "github-token";
        state.error = null;
        rerender();
      },
      getRemainingSeconds() {
        return deviceAuthController.getRemainingSeconds();
      },
    },
    github: {
      setTokenInput(value) {
        state.tokenInput = value;
      },
      advance() {
        return advanceGithubToken();
      },
      skip() {
        state.step = "done";
        state.error = null;
        rerender();
      },
    },
    done: {
      createTestIssue,
      createLabel,
      openDashboard() {
        deps.dispatchEvent(new CustomEvent("setup:complete"));
        deps.router.navigate("/");
      },
      async resetSetup() {
        if (!deps.confirm("This will clear all stored secrets (Linear, OpenAI, GitHub keys). Are you sure?")) {
          return;
        }
        await resetFromDone();
      },
    },
  };
}
