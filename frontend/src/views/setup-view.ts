import { registerPageCleanup } from "../utils/page";
import {
  createSetupWizard,
  SETUP_STEP_DEFS,
  SETUP_STEP_ORDER,
  type SetupStep,
  type SetupWizard,
} from "../features/setup/setup-wizard";
import { buildDoneStep as buildDoneStepContent } from "./setup-done-step";
import { buildGithubTokenStep as buildGithubTokenStepContent } from "./setup-github-step";
import { buildLinearProjectStep } from "./setup-linear-step";
import { buildMasterKeyStep } from "./setup-master-key-step";
import { buildOpenaiKeyStep as buildOpenaiKeyStepContent } from "./setup-openai-step";
import { buildRepoConfigStep } from "./setup-repo-step";

function resolveStepState(wizard: SetupWizard, stepKey: SetupStep, currentIdx: number): "done" | "active" | "upcoming" {
  const stepIdx = SETUP_STEP_ORDER.findIndex((step) => step === stepKey);
  if (currentIdx > stepIdx) {
    return "done";
  }
  if (stepKey === wizard.state.step) {
    return "active";
  }
  return "upcoming";
}

function buildStepItem(
  wizard: SetupWizard,
  stepDef: (typeof SETUP_STEP_DEFS)[number],
  stepState: "done" | "active" | "upcoming",
): HTMLElement {
  const indicator = document.createElement("div");
  indicator.className = `setup-step-indicator is-${stepState} is-clickable`;
  indicator.setAttribute("aria-current", stepState === "active" ? "step" : "false");
  indicator.setAttribute("role", "button");
  indicator.setAttribute("tabindex", "0");

  const handleNavigate = (): void => {
    wizard.navigateToStep(stepDef.key);
  };

  indicator.addEventListener("click", handleNavigate);
  indicator.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNavigate();
    }
  });

  const dot = document.createElement("div");
  dot.className = "setup-step-dot";
  dot.textContent = stepState === "done" ? "\u2713" : stepDef.n;
  if (stepState === "done" && wizard.state.step === "done") {
    dot.classList.add("delight-check");
  }

  const label = document.createElement("span");
  label.className = "setup-step-label";
  label.textContent = stepDef.label;

  indicator.append(dot, label);
  return indicator;
}

function buildStepIndicator(wizard: SetupWizard): HTMLElement {
  const currentIdx = SETUP_STEP_ORDER.findIndex((step) => step === wizard.state.step);

  const row = document.createElement("div");
  row.className = "setup-steps";
  row.setAttribute("role", "navigation");
  row.setAttribute(
    "aria-label",
    `Setup progress: step ${Math.min(currentIdx + 1, SETUP_STEP_DEFS.length)} of ${SETUP_STEP_DEFS.length}`,
  );

  for (let index = 0; index < SETUP_STEP_DEFS.length; index += 1) {
    const stepDef = SETUP_STEP_DEFS[index];
    const stepState = resolveStepState(wizard, stepDef.key, currentIdx);
    row.append(buildStepItem(wizard, stepDef, stepState));

    if (index < SETUP_STEP_DEFS.length - 1) {
      const connector = document.createElement("div");
      const isFilled = stepState === "done";
      connector.className = `setup-step-connector${isFilled ? " is-filled" : ""}`;
      if (isFilled && wizard.state.step === "done") {
        connector.classList.add("delight-fill");
        connector.style.animationDelay = `${index * 80}ms`;
      }
      row.append(connector);
    }
  }

  return row;
}

function buildMasterKeyStepSetup(wizard: SetupWizard): HTMLElement {
  return buildMasterKeyStep(
    {
      loading: wizard.state.loading,
      error: wizard.state.error,
      generatedKey: wizard.state.generatedKey,
    },
    {
      onAdvance: () => wizard.masterKey.advance(),
      onGenerateKey: () => {
        void wizard.masterKey.generateKey();
      },
      onResetSetup: () => {
        void wizard.masterKey.resetSetup();
      },
    },
  );
}

function buildLinearProjectStepSetup(wizard: SetupWizard): HTMLElement {
  return buildLinearProjectStep(
    {
      loading: wizard.state.loading,
      error: wizard.state.error,
      apiKeyInput: wizard.state.apiKeyInput,
      apiKeyVerified: wizard.state.apiKeyVerified,
      projects: wizard.state.projects,
      selectedProject: wizard.state.selectedProject,
      createdProjectName: wizard.state.createdProjectName,
      createdProjectUrl: wizard.state.createdProjectUrl,
    },
    {
      onApiKeyInput: (value) => wizard.linearProject.setApiKeyInput(value),
      onVerifyKey: () => {
        void wizard.linearProject.verifyKey();
      },
      onSelectProject: (slugId) => wizard.linearProject.selectProject(slugId),
      onCreateProject: (name) => {
        void wizard.linearProject.createProject(name);
      },
      onAdvance: () => {
        void wizard.linearProject.advance();
      },
      onSkip: () => wizard.linearProject.skip(),
    },
  );
}

function buildRepoConfigStepSetup(wizard: SetupWizard): HTMLElement {
  return buildRepoConfigStep(
    {
      loading: wizard.state.loading,
      error: wizard.state.error,
      teamKey: wizard.state.teamKey,
      repoUrlInput: wizard.state.repoUrlInput,
      defaultBranchInput: wizard.state.defaultBranchInput,
      labelInput: wizard.state.labelInput,
      showAdvanced: wizard.state.showRepoAdvanced,
      routes: wizard.state.repoRoutes,
    },
    {
      onRepoUrlInput: (value) => wizard.repoConfig.setRepoUrlInput(value),
      onDefaultBranchInput: (value) => wizard.repoConfig.setDefaultBranchInput(value),
      onLabelInput: (value) => wizard.repoConfig.setLabelInput(value),
      onToggleAdvanced: () => wizard.repoConfig.toggleAdvanced(),
      onSave: () => {
        void wizard.repoConfig.save();
      },
      onSkip: () => wizard.repoConfig.skip(),
      onDeleteRoute: (index) => {
        void wizard.repoConfig.deleteRoute(index);
      },
      onDetectDefaultBranch: (repoUrl) => wizard.repoConfig.detectDefaultBranch(repoUrl),
    },
  );
}

function buildOpenaiKeyStep(wizard: SetupWizard): HTMLElement {
  return buildOpenaiKeyStepContent(
    {
      loading: wizard.state.loading,
      error: wizard.state.error,
      openaiKeyInput: wizard.state.openaiKeyInput,
      providerNameInput: wizard.state.providerNameInput,
      providerBaseUrlInput: wizard.state.providerBaseUrlInput,
      providerTokenInput: wizard.state.providerTokenInput,
      authMode: wizard.state.authMode,
      authJsonInput: wizard.state.authJsonInput,
      showManualAuthFallback: wizard.state.showManualAuthFallback,
      deviceAuthStatus: wizard.state.deviceAuthStatus,
      deviceAuthUserCode: wizard.state.deviceAuthUserCode,
      deviceAuthVerificationUri: wizard.state.deviceAuthVerificationUri,
      deviceAuthIntervalSeconds: wizard.state.deviceAuthIntervalSeconds,
      deviceAuthExpiresAt: wizard.state.deviceAuthExpiresAt,
      deviceAuthError: wizard.state.deviceAuthError,
      deviceAuthRemainingSeconds: wizard.openai.getRemainingSeconds(),
    },
    {
      onSelectAuthMode: (mode) => wizard.openai.selectAuthMode(mode),
      onOpenaiKeyInput: (value) => wizard.openai.setOpenaiKeyInput(value),
      onProviderNameInput: (value) => wizard.openai.setProviderNameInput(value),
      onProviderBaseUrlInput: (value) => wizard.openai.setProviderBaseUrlInput(value),
      onProviderTokenInput: (value) => wizard.openai.setProviderTokenInput(value),
      onAuthJsonInput: (value) => wizard.openai.setAuthJsonInput(value),
      onStartDeviceAuth: () => {
        void wizard.openai.startDeviceAuth();
      },
      onCancelDeviceAuth: () => {
        void wizard.openai.cancelDeviceAuth();
      },
      onToggleManualAuthFallback: () => wizard.openai.toggleManualAuthFallback(),
      onAdvance: () => {
        void wizard.openai.advance();
      },
      onSkip: () => wizard.openai.skip(),
    },
  );
}

function buildGithubTokenStepSetup(wizard: SetupWizard): HTMLElement {
  return buildGithubTokenStepContent(
    {
      loading: wizard.state.loading,
      error: wizard.state.error,
      tokenInput: wizard.state.tokenInput,
    },
    {
      onTokenInput: (value) => wizard.github.setTokenInput(value),
      onAdvance: () => {
        void wizard.github.advance();
      },
      onSkip: () => wizard.github.skip(),
    },
  );
}

function buildDoneStepSetup(wizard: SetupWizard): HTMLElement {
  return buildDoneStepContent(
    {
      testIssueLoading: wizard.state.testIssueLoading,
      testIssueCreated: wizard.state.testIssueCreated,
      testIssueIdentifier: wizard.state.testIssueIdentifier,
      testIssueUrl: wizard.state.testIssueUrl,
      testIssueError: wizard.state.testIssueError,
      labelLoading: wizard.state.labelLoading,
      labelCreated: wizard.state.labelCreated,
      labelName: wizard.state.labelName,
      labelError: wizard.state.labelError,
    },
    {
      onCreateTestIssue: () => {
        void wizard.done.createTestIssue();
      },
      onCreateLabel: () => {
        void wizard.done.createLabel();
      },
      onOpenDashboard: () => wizard.done.openDashboard(),
      onResetSetup: () => {
        void wizard.done.resetSetup();
      },
    },
  );
}

function buildStepContent(wizard: SetupWizard): HTMLElement {
  switch (wizard.state.step) {
    case "master-key":
      return buildMasterKeyStepSetup(wizard);
    case "linear-project":
      return buildLinearProjectStepSetup(wizard);
    case "repo-config":
      return buildRepoConfigStepSetup(wizard);
    case "openai-key":
      return buildOpenaiKeyStep(wizard);
    case "github-token":
      return buildGithubTokenStepSetup(wizard);
    case "done":
      return buildDoneStepSetup(wizard);
  }
}

function buildPage(wizard: SetupWizard): HTMLElement {
  const page = document.createElement("div");

  if (wizard.state.step === "master-key") {
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
    page.append(intro);
  }

  if (wizard.state.step !== "done") {
    page.append(buildStepIndicator(wizard));
  }

  const content = document.createElement("div");
  content.className = "setup-content";
  content.append(buildStepContent(wizard));
  page.append(content);

  return page;
}

export function createSetupPage(): HTMLElement {
  let container: HTMLElement | null = null;

  const rerender = (): void => {
    if (!container) {
      return;
    }
    container.replaceChildren(buildPage(wizard));
  };

  const wizard = createSetupWizard({ rerender });

  const page = document.createElement("div");
  page.className = "setup-page fade-in";
  container = page;

  registerPageCleanup(page, () => {
    wizard.dispose();
    container = null;
  });

  wizard.initialize();
  page.append(buildPage(wizard));
  return page;
}
