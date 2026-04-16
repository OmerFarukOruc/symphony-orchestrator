import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSetupWizard } from "../../frontend/src/features/setup/setup-wizard";

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createApi() {
  return {
    getSetupStatus: vi.fn(async () => ({
      configured: false,
      steps: {
        masterKey: { done: false },
        linearProject: { done: false },
        repoRoute: { done: false },
        openaiKey: { done: false },
        githubToken: { done: false },
      },
    })),
    postMasterKey: vi.fn(async () => ({ key: "sym_test_master_key_abc123" })),
    postSecret: vi.fn(async () => ({ ok: true })),
    getLinearProjects: vi.fn(async () => ({
      projects: [{ id: "p1", name: "Ninja", slugId: "NIN", teamKey: "nin" }],
    })),
    postLinearProject: vi.fn(async () => ({ ok: true })),
    postRepoRoute: vi.fn(async () => ({ ok: true, route: {} })),
    getRepoRoutes: vi.fn(async () => ({ routes: [{ repoUrl: "https://github.com/acme/repo" }] })),
    deleteRepoRoute: vi.fn(async () => ({ ok: true, routes: [] })),
    detectDefaultBranch: vi.fn(async () => ({ defaultBranch: "main" })),
    postOpenaiKey: vi.fn(async () => ({ valid: true })),
    postCodexAuth: vi.fn(async () => ({ ok: true })),
    startPkceAuth: vi.fn(async () => ({ authUrl: "https://example.com/auth" })),
    pollPkceAuthStatus: vi.fn(async () => ({ status: "pending" })),
    cancelPkceAuth: vi.fn(async () => ({ ok: true })),
    postGithubToken: vi.fn(async () => ({ valid: true })),
    resetSetup: vi.fn(async () => ({ ok: true })),
    createTestIssue: vi.fn(async () => ({ ok: true, issueIdentifier: "NIN-1", issueUrl: "https://linear.app/NIN-1" })),
    createLabel: vi.fn(async () => ({ ok: true, labelName: "risoluto" })),
    createProject: vi.fn(async (name: string) => ({
      ok: true,
      project: { id: "p2", name, slugId: "OPS", teamKey: "ops", url: "https://linear.app/project/ops" },
    })),
  };
}

function createWizard() {
  const api = createApi();
  const router = { navigate: vi.fn() };
  const confirm = vi.fn(() => true);
  const alert = vi.fn();
  const dispatchEvent = vi.fn(() => true);
  const rerender = vi.fn();

  const wizard = createSetupWizard({
    rerender,
    deps: {
      api: api as never,
      router,
      confirm,
      alert,
      dispatchEvent,
    },
  });

  return { api, alert, confirm, dispatchEvent, rerender, router, wizard };
}

describe("setup-wizard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes the wizard by auto-generating a master key when setup is incomplete", async () => {
    const { api, wizard } = createWizard();

    wizard.initialize();
    await flushMicrotasks();

    expect(api.getSetupStatus).toHaveBeenCalledTimes(1);
    expect(api.postMasterKey).toHaveBeenCalledTimes(1);
    expect(wizard.state.generatedKey).toBe("sym_test_master_key_abc123");
    expect(wizard.state.step).toBe("master-key");
  });

  it("verifies a Linear key, loads projects, and advances into the repo step", async () => {
    const { api, wizard } = createWizard();

    wizard.state.generatedKey = "set";
    wizard.masterKey.advance();
    wizard.linearProject.setApiKeyInput("lin_api_test_key_123");

    await wizard.linearProject.verifyKey();

    expect(api.postSecret).toHaveBeenCalledWith("LINEAR_API_KEY", "lin_api_test_key_123");
    expect(api.getLinearProjects).toHaveBeenCalledTimes(1);
    expect(wizard.state.apiKeyVerified).toBe(true);
    expect(wizard.state.projects).toHaveLength(1);

    wizard.linearProject.selectProject("NIN");
    await wizard.linearProject.advance();

    expect(api.postLinearProject).toHaveBeenCalledWith("NIN");
    expect(wizard.state.step).toBe("repo-config");
    expect(wizard.state.teamKey).toBe("nin");
  });

  it("persists repo routing and advances to the OpenAI step through one wizard boundary", async () => {
    const { api, wizard } = createWizard();

    wizard.state.step = "repo-config";
    wizard.state.teamKey = "nin";
    wizard.repoConfig.setRepoUrlInput("https://github.com/acme/repo");
    wizard.repoConfig.setDefaultBranchInput("develop");
    wizard.repoConfig.setLabelInput("bugs");

    await wizard.repoConfig.save();

    expect(api.postRepoRoute).toHaveBeenCalledWith({
      repoUrl: "https://github.com/acme/repo",
      defaultBranch: "develop",
      identifierPrefix: "NIN",
      label: "bugs",
    });
    expect(api.getRepoRoutes).toHaveBeenCalledTimes(1);
    expect(wizard.state.repoRoutes).toEqual([{ repoUrl: "https://github.com/acme/repo" }]);
    expect(wizard.state.step).toBe("openai-key");
  });

  it("submits proxy-provider auth and moves the wizard to the GitHub step", async () => {
    const { api, wizard } = createWizard();

    wizard.state.step = "openai-key";
    wizard.openai.selectAuthMode("proxy_provider");
    wizard.openai.setProviderNameInput("CLIProxyAPI");
    wizard.openai.setProviderBaseUrlInput("http://127.0.0.1:8317/v1");
    wizard.openai.setProviderTokenInput("proxy-token");

    await wizard.openai.advance();

    expect(api.postOpenaiKey).toHaveBeenCalledWith({
      key: "proxy-token",
      provider: {
        name: "CLIProxyAPI",
        baseUrl: "http://127.0.0.1:8317/v1",
      },
    });
    expect(wizard.state.step).toBe("github-token");
    expect(wizard.state.error).toBeNull();
  });
});
