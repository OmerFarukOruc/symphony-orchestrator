/* eslint-disable complexity, sonarjs/cognitive-complexity */
import type { ChangeEvent, ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { queryKeys } from "../hooks/query-client.js";
import { useSSE } from "../hooks/useSSE.js";
import { saveSecret } from "./secrets-api.js";
import styles from "./Setup.module.css";
import {
  cancelPkceAuth,
  createLabel,
  createMasterKey,
  createProject,
  createTestIssue,
  deleteRepoRoute,
  detectDefaultBranch,
  fetchLinearProjects,
  fetchPkceStatus,
  fetchRepoRoutes,
  fetchSetupStatusDetail,
  resetSetup,
  saveCodexAuth,
  saveGithubToken,
  saveLinearProject,
  saveOpenaiKey,
  saveRepoRoute,
  startPkceAuth,
} from "./setup-api.js";

type SetupStep =
  | "master-key"
  | "linear-project"
  | "repo-config"
  | "openai-key"
  | "github-token"
  | "agent-config"
  | "sandbox-safety"
  | "prompt-template"
  | "workspace-hooks"
  | "done";

type OpenaiAuthMode = "api_key" | "codex_login";

type LinearProject = Readonly<{
  id: unknown;
  name: unknown;
  slugId: unknown;
  teamKey: string | null;
}>;

type NoticeState = Readonly<{ message: string; tone: "error" | "success" }> | null;

const STEP_ITEMS: ReadonlyArray<Readonly<{ key: SetupStep; label: string }>> = [
  { key: "master-key", label: "Protect secrets" },
  { key: "linear-project", label: "Connect Linear" },
  { key: "repo-config", label: "Link repo" },
  { key: "openai-key", label: "Add OpenAI" },
  { key: "github-token", label: "Add GitHub" },
  { key: "agent-config", label: "Agent config" },
  { key: "sandbox-safety", label: "Sandbox" },
  { key: "prompt-template", label: "Prompt" },
  { key: "workspace-hooks", label: "Hooks" },
] as const;

function isGitHubRepoUrl(value: string): boolean {
  return /^https:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/i.test(value);
}

function stepIndex(step: SetupStep): number {
  return STEP_ITEMS.findIndex((item) => item.key === step);
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function SetupRoute(): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<SetupStep>("master-key");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [linearApiKeyInput, setLinearApiKeyInput] = useState<string>("");
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [teamKey, setTeamKey] = useState<string | null>(null);
  const [repoUrlInput, setRepoUrlInput] = useState<string>("");
  const [defaultBranchInput, setDefaultBranchInput] = useState<string>("main");
  const [labelInput, setLabelInput] = useState<string>("");
  const [showRepoAdvanced, setShowRepoAdvanced] = useState<boolean>(false);
  const [openaiAuthMode, setOpenaiAuthMode] = useState<OpenaiAuthMode>("api_key");
  const [openaiKeyInput, setOpenaiKeyInput] = useState<string>("");
  const [authJsonInput, setAuthJsonInput] = useState<string>("");
  const [showManualAuthFallback, setShowManualAuthFallback] = useState<boolean>(false);
  const [githubTokenInput, setGithubTokenInput] = useState<string>("");
  const [pkceActive, setPkceActive] = useState<boolean>(false);
  const [createdProjectName, setCreatedProjectName] = useState<string | null>(null);
  const [createdProjectUrl, setCreatedProjectUrl] = useState<string | null>(null);
  const [testIssueIdentifier, setTestIssueIdentifier] = useState<string | null>(null);
  const [testIssueUrl, setTestIssueUrl] = useState<string | null>(null);
  const [labelName, setLabelName] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  useSSE();

  const statusQuery = useQuery({
    queryKey: queryKeys.setupStatusDetail,
    queryFn: fetchSetupStatusDetail,
    staleTime: 4_000,
  });

  const repoRoutesQuery = useQuery({
    queryKey: queryKeys.setupRepoRoutes,
    queryFn: fetchRepoRoutes,
    enabled: step === "repo-config",
    staleTime: 4_000,
  });

  const pkceStatusQuery = useQuery({
    queryKey: queryKeys.setupPkceStatus,
    queryFn: fetchPkceStatus,
    enabled: pkceActive,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" || query.state.data === undefined ? 2_000 : false,
  });

  useEffect(() => {
    const authStatus = pkceStatusQuery.data?.status;
    if (authStatus === "complete") {
      setPkceActive(false);
      setNotice({ message: "OpenAI browser sign-in completed.", tone: "success" });
      void queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      void queryClient.invalidateQueries({ queryKey: queryKeys.setupStatusDetail });
      setStep("github-token");
    }
    if (authStatus === "expired" || authStatus === "error") {
      setPkceActive(false);
      setNotice({ message: pkceStatusQuery.data?.error ?? "Browser sign-in expired.", tone: "error" });
    }
  }, [pkceStatusQuery.data, queryClient]);

  const masterKeyMutation = useMutation({
    mutationFn: createMasterKey,
    onSuccess: async (data) => {
      setGeneratedKey(data.key);
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatusDetail });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Master key generation failed.";
      if (message.includes("already")) {
        setGeneratedKey("set");
        return;
      }
      setNotice({ message, tone: "error" });
    },
  });

  useEffect(() => {
    const status = statusQuery.data;
    if (!status) {
      return;
    }

    if (!status.steps.masterKey.done && generatedKey === null) {
      void masterKeyMutation.mutateAsync();
      return;
    }

    if (status.steps.masterKey.done && generatedKey === null) {
      setGeneratedKey("set");
    }
  }, [generatedKey, masterKeyMutation, statusQuery.data]);

  const verifyLinearMutation = useMutation({
    mutationFn: async () => {
      await saveSecret("LINEAR_API_KEY", linearApiKeyInput);
      return fetchLinearProjects();
    },
    onSuccess: (data) => {
      setProjects(data.projects.map((project) => ({ ...project, teamKey: project.teamKey })));
      setNotice({
        message: data.projects.length === 0 ? "Linear key verified. No projects found yet." : "Linear key verified.",
        tone: "success",
      });
    },
    onError: (error) => {
      setProjects([]);
      setSelectedProject(null);
      setNotice({ message: error instanceof Error ? error.message : "Linear verification failed.", tone: "error" });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (name: string) => createProject(name),
    onSuccess: (data) => {
      setProjects([
        {
          id: data.project.id ?? null,
          name: data.project.name ?? data.project.slugId,
          slugId: data.project.slugId,
          teamKey: data.project.teamKey,
        },
      ]);
      setSelectedProject(data.project.slugId);
      setCreatedProjectName(data.project.name ?? data.project.slugId);
      setCreatedProjectUrl(data.project.url);
      setNotice({ message: `Project ${data.project.slugId} created.`, tone: "success" });
    },
    onError: (error) => {
      setNotice({ message: error instanceof Error ? error.message : "Project creation failed.", tone: "error" });
    },
  });

  const saveLinearProjectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject) {
        throw new Error("Choose a Linear project first.");
      }
      return saveLinearProject(selectedProject);
    },
    onSuccess: async () => {
      const selected = projects.find((project) => String(project.slugId) === selectedProject) ?? null;
      setTeamKey(selected?.teamKey ?? null);
      setStep("repo-config");
      setNotice(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatusDetail });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupRepoRoutes });
    },
    onError: (error) => {
      setNotice({ message: error instanceof Error ? error.message : "Saving Linear project failed.", tone: "error" });
    },
  });

  const detectBranchMutation = useMutation({
    mutationFn: async (repoUrl: string) => detectDefaultBranch(repoUrl),
    onSuccess: (data) => {
      setDefaultBranchInput(data.defaultBranch);
    },
  });

  const saveRepoRouteMutation = useMutation({
    mutationFn: async () => {
      if (!isGitHubRepoUrl(repoUrlInput.trim())) {
        throw new Error("Enter a GitHub repository URL like https://github.com/org/repo.");
      }
      return saveRepoRoute({
        repoUrl: repoUrlInput.trim(),
        defaultBranch: defaultBranchInput.trim() || "main",
        identifierPrefix: teamKey?.toUpperCase() ?? "DEFAULT",
        label: labelInput.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setNotice({ message: "Repository route saved.", tone: "success" });
      setStep("openai-key");
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatusDetail });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupRepoRoutes });
    },
    onError: (error) => {
      setNotice({ message: error instanceof Error ? error.message : "Saving repo route failed.", tone: "error" });
    },
  });

  const deleteRepoRouteMutation = useMutation({
    mutationFn: async (index: number) => deleteRepoRoute(index),
    onSuccess: async () => {
      setNotice({ message: "Repository route removed.", tone: "success" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupRepoRoutes });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatusDetail });
    },
    onError: (error) => {
      setNotice({ message: error instanceof Error ? error.message : "Deleting repo route failed.", tone: "error" });
    },
  });

  const saveOpenaiMutation = useMutation({
    mutationFn: async () => {
      if (openaiAuthMode === "api_key") {
        const result = await saveOpenaiKey(openaiKeyInput);
        if (!result.valid) {
          throw new Error("Key validation failed — check your key and try again.");
        }
        return;
      }
      await saveCodexAuth(authJsonInput);
    },
    onSuccess: async () => {
      setNotice({ message: "OpenAI access saved.", tone: "success" });
      setStep("github-token");
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatusDetail });
    },
    onError: (error) => {
      setNotice({ message: error instanceof Error ? error.message : "OpenAI setup failed.", tone: "error" });
    },
  });

  const startPkceMutation = useMutation({
    mutationFn: startPkceAuth,
    onSuccess: (data) => {
      window.open(data.authUrl, "_blank", "noopener,noreferrer");
      setPkceActive(true);
      setNotice({ message: "Opened OpenAI sign-in in a new tab.", tone: "success" });
    },
    onError: (error) => {
      setNotice({ message: error instanceof Error ? error.message : "OpenAI sign-in failed.", tone: "error" });
    },
  });

  const cancelPkceMutation = useMutation({
    mutationFn: cancelPkceAuth,
    onSuccess: () => {
      setPkceActive(false);
      setNotice({ message: "OpenAI sign-in cancelled.", tone: "success" });
    },
  });

  const saveGithubMutation = useMutation({
    mutationFn: async () => {
      const result = await saveGithubToken(githubTokenInput);
      if (!result.valid) {
        throw new Error("Token validation failed — check the token and try again.");
      }
    },
    onSuccess: async () => {
      setNotice({ message: "GitHub token saved.", tone: "success" });
      setStep("done");
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatusDetail });
    },
    onError: (error) => {
      setNotice({ message: error instanceof Error ? error.message : "GitHub token validation failed.", tone: "error" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetSetup,
    onSuccess: async () => {
      setGeneratedKey(null);
      setStep("master-key");
      setProjects([]);
      setSelectedProject(null);
      setTeamKey(null);
      setRepoUrlInput("");
      setDefaultBranchInput("main");
      setLabelInput("");
      setOpenaiAuthMode("api_key");
      setOpenaiKeyInput("");
      setAuthJsonInput("");
      setGithubTokenInput("");
      setPkceActive(false);
      setNotice({ message: "Setup reset. Start again from step one.", tone: "success" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      await queryClient.invalidateQueries({ queryKey: queryKeys.setupStatusDetail });
      await masterKeyMutation.mutateAsync();
    },
    onError: (error) => {
      setNotice({ message: error instanceof Error ? error.message : "Setup reset failed.", tone: "error" });
    },
  });

  const createTestIssueMutation = useMutation({
    mutationFn: createTestIssue,
    onSuccess: (data) => {
      setTestIssueIdentifier(data.issueIdentifier);
      setTestIssueUrl(data.issueUrl);
    },
  });

  const createLabelMutation = useMutation({
    mutationFn: createLabel,
    onSuccess: (data) => {
      setLabelName(data.labelName);
    },
  });

  const currentStepIndex = useMemo(() => stepIndex(step), [step]);
  const selectedProjectCard = projects.find((project) => String(project.slugId) === selectedProject) ?? null;

  function renderStepContent(): ReactElement {
    if (step === "master-key") {
      const keyAlreadySet = generatedKey === "set";
      return (
        <div className={styles.contentStack}>
          <StepTitle title="Protect your secrets" badge="Required" />
          <p className={styles.subtitle}>
            {keyAlreadySet
              ? "Your encryption key was generated during a previous setup. It protects stored credentials on this machine."
              : "Symphony uses an encryption key to protect stored credentials on your machine. A key is generated locally before you continue."}
          </p>
          <div className={styles.callout}>
            {keyAlreadySet ? (
              <>
                <strong>Master key is configured.</strong> Your stored secrets stay encrypted and protected.
              </>
            ) : (
              <>
                <strong>Important:</strong> Save this key somewhere safe. If you lose it, you must re-enter all
                credentials.
              </>
            )}
          </div>
          {!keyAlreadySet ? <div className={styles.keyValue}>{generatedKey ?? "Generating…"}</div> : null}
          <div className={styles.actionsRow}>
            <button
              className={styles.secondaryButton}
              disabled={resetMutation.isPending || masterKeyMutation.isPending}
              onClick={() => void resetMutation.mutateAsync()}
              type="button"
            >
              {keyAlreadySet ? "Reconfigure" : "Regenerate"}
            </button>
            <button
              className={styles.primaryButton}
              disabled={generatedKey === null || masterKeyMutation.isPending}
              onClick={() => setStep("linear-project")}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      );
    }

    if (step === "linear-project") {
      return (
        <div className={styles.contentStack}>
          <StepTitle title="Connect to Linear" badge="Required" />
          <p className={styles.subtitle}>Enter your Linear API key and choose the project Symphony should track.</p>
          <label className={styles.field} htmlFor="setup-linear-api-key">
            <span className={styles.fieldLabel}>Linear API key</span>
            <input
              className={styles.input}
              id="setup-linear-api-key"
              onChange={(event) => setLinearApiKeyInput(event.target.value)}
              placeholder="lin_api_…"
              type="password"
              value={linearApiKeyInput}
            />
          </label>
          <div className={styles.inlineActions}>
            <button
              className={styles.primaryButton}
              disabled={verifyLinearMutation.isPending || linearApiKeyInput.length === 0}
              onClick={() => void verifyLinearMutation.mutateAsync()}
              type="button"
            >
              {verifyLinearMutation.isPending ? "Verifying…" : "Verify key"}
            </button>
            <a
              className={styles.inlineLink}
              href="https://linear.app/settings/account/security/api-keys/new"
              rel="noreferrer"
              target="_blank"
            >
              Create a personal API key →
            </a>
          </div>

          {createdProjectName ? (
            <div className={styles.callout}>
              <strong>Project created.</strong> {createdProjectName} is selected and ready to use.
              {createdProjectUrl ? (
                <a className={styles.inlineLink} href={createdProjectUrl} rel="noreferrer" target="_blank">
                  {" "}
                  View in Linear →
                </a>
              ) : null}
            </div>
          ) : null}

          {projects.length > 0 ? (
            <div className={styles.projectGrid}>
              {projects.map((project) => {
                const slugId = String(project.slugId);
                const selected = slugId === selectedProject;
                return (
                  <button
                    aria-pressed={selected}
                    className={selected ? `${styles.projectCard} ${styles.projectCardSelected}` : styles.projectCard}
                    key={slugId}
                    onClick={() => setSelectedProject(slugId)}
                    type="button"
                  >
                    <span className={styles.projectName}>{String(project.name)}</span>
                    <span className={styles.projectSlug}>{slugId}</span>
                  </button>
                );
              })}
            </div>
          ) : verifyLinearMutation.isSuccess ? (
            <CreateProjectPanel
              loading={createProjectMutation.isPending}
              onCreate={(name) => void createProjectMutation.mutateAsync(name)}
            />
          ) : null}

          <div className={styles.actionsRow}>
            <button className={styles.secondaryButton} onClick={() => setStep("github-token")} type="button">
              Skip
            </button>
            <button
              className={styles.primaryButton}
              disabled={selectedProject === null || saveLinearProjectMutation.isPending}
              onClick={() => void saveLinearProjectMutation.mutateAsync()}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      );
    }

    if (step === "repo-config") {
      return (
        <div className={styles.contentStack}>
          <StepTitle title="Link your repository" badge="Optional" />
          <p className={styles.subtitle}>
            Tell Symphony which GitHub repo to target when handling issues from this Linear project.
          </p>
          <div className={styles.callout}>
            Repos are optional, but linking a repo enables direct branch pushes and PR creation.
          </div>
          {repoRoutesQuery.data && repoRoutesQuery.data.routes.length > 0 ? (
            <section className={styles.routeListSection}>
              <span className={styles.fieldLabel}>Linked repositories</span>
              <ul className={styles.routeList}>
                {repoRoutesQuery.data.routes.map((route, index) => (
                  <li className={styles.routeRow} key={`${route.identifier_prefix}-${route.repo_url}`}>
                    <div className={styles.routeInfo}>
                      <span className={styles.routePrefix}>{route.identifier_prefix}</span>
                      <span className={styles.routeUrl}>{route.repo_url}</span>
                    </div>
                    <button
                      className={styles.secondaryButton}
                      disabled={deleteRepoRouteMutation.isPending}
                      onClick={() => void deleteRepoRouteMutation.mutateAsync(index)}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Identifier prefix</span>
            <span className={styles.prefixChip}>{teamKey ?? selectedProjectCard?.teamKey ?? "N/A"}</span>
          </div>
          <label className={styles.field} htmlFor="setup-repo-url">
            <span className={styles.fieldLabel}>GitHub repository URL</span>
            <input
              className={styles.input}
              id="setup-repo-url"
              onBlur={() => {
                if (isGitHubRepoUrl(repoUrlInput.trim())) {
                  void detectBranchMutation.mutateAsync(repoUrlInput.trim());
                }
              }}
              onChange={(event) => setRepoUrlInput(event.target.value)}
              placeholder="https://github.com/org/repo"
              type="url"
              value={repoUrlInput}
            />
          </label>
          <label className={styles.field} htmlFor="setup-repo-branch">
            <span className={styles.fieldLabel}>Default branch</span>
            <input
              className={styles.input}
              id="setup-repo-branch"
              onChange={(event) => setDefaultBranchInput(event.target.value)}
              value={defaultBranchInput}
            />
          </label>
          <button
            aria-expanded={showRepoAdvanced}
            className={styles.secondaryButton}
            onClick={() => setShowRepoAdvanced((current) => !current)}
            type="button"
          >
            {showRepoAdvanced ? "Hide advanced options" : "Show advanced options"}
          </button>
          {showRepoAdvanced ? (
            <label className={styles.field} htmlFor="setup-repo-label">
              <span className={styles.fieldLabel}>Label-based routing (optional)</span>
              <input
                className={styles.input}
                id="setup-repo-label"
                onChange={(event) => setLabelInput(event.target.value)}
                placeholder="backend"
                value={labelInput}
              />
            </label>
          ) : null}
          <div className={styles.actionsRow}>
            <button className={styles.secondaryButton} onClick={() => setStep("openai-key")} type="button">
              Skip
            </button>
            <button
              className={styles.primaryButton}
              disabled={repoUrlInput.trim().length === 0 || saveRepoRouteMutation.isPending}
              onClick={() => void saveRepoRouteMutation.mutateAsync()}
              type="button"
            >
              Save & Continue
            </button>
          </div>
        </div>
      );
    }

    if (step === "openai-key") {
      return (
        <div className={styles.contentStack}>
          <StepTitle title="Connect to OpenAI" badge="Required" />
          <p className={styles.subtitle}>Choose how Codex agents authenticate with OpenAI.</p>
          <div className={styles.authGrid}>
            <button
              className={
                openaiAuthMode === "api_key" ? `${styles.authCard} ${styles.authCardSelected}` : styles.authCard
              }
              onClick={() => setOpenaiAuthMode("api_key")}
              type="button"
            >
              <span className={styles.authCardTitle}>API Key</span>
              <span className={styles.authCardDescription}>
                Paste an OpenAI API key directly. Best for pay-as-you-go accounts.
              </span>
            </button>
            <button
              className={
                openaiAuthMode === "codex_login" ? `${styles.authCard} ${styles.authCardSelected}` : styles.authCard
              }
              onClick={() => setOpenaiAuthMode("codex_login")}
              type="button"
            >
              <span className={styles.authCardTitle}>Codex Login</span>
              <span className={styles.authCardDescription}>
                Sign in with the browser-based OpenAI flow. Best for OpenAI-authenticated accounts.
              </span>
            </button>
          </div>
          {openaiAuthMode === "api_key" ? (
            <label className={styles.field} htmlFor="setup-openai-key">
              <span className={styles.fieldLabel}>OpenAI API key</span>
              <input
                className={styles.input}
                id="setup-openai-key"
                onChange={(event) => setOpenaiKeyInput(event.target.value)}
                placeholder="sk-…"
                type="password"
                value={openaiKeyInput}
              />
            </label>
          ) : (
            <>
              <div className={styles.callout}>
                <strong>Browser sign-in.</strong> Open the OpenAI sign-in page in a new tab, or paste auth.json manually
                as a fallback.
              </div>
              <div className={styles.inlineActions}>
                <button
                  className={styles.primaryButton}
                  disabled={startPkceMutation.isPending}
                  onClick={() => void startPkceMutation.mutateAsync()}
                  type="button"
                >
                  {pkceActive ? "Retry sign-in" : "Sign in with OpenAI"}
                </button>
                {pkceActive ? (
                  <button
                    className={styles.secondaryButton}
                    onClick={() => void cancelPkceMutation.mutateAsync()}
                    type="button"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              {pkceActive ? <p className={styles.statusText}>Waiting for OpenAI sign-in approval…</p> : null}
              <button
                aria-expanded={showManualAuthFallback}
                className={styles.secondaryButton}
                onClick={() => setShowManualAuthFallback((current) => !current)}
                type="button"
              >
                {showManualAuthFallback ? "Hide fallback" : "Use auth.json instead"}
              </button>
              {showManualAuthFallback ? (
                <label className={styles.field} htmlFor="setup-auth-json">
                  <span className={styles.fieldLabel}>auth.json contents</span>
                  <textarea
                    className={styles.textarea}
                    id="setup-auth-json"
                    onChange={(event) => setAuthJsonInput(event.target.value)}
                    placeholder='{"access_token":"..."}'
                    value={authJsonInput}
                  />
                </label>
              ) : null}
            </>
          )}
          <div className={styles.actionsRow}>
            <button className={styles.secondaryButton} onClick={() => setStep("github-token")} type="button">
              Skip for now
            </button>
            <button
              className={styles.primaryButton}
              disabled={
                saveOpenaiMutation.isPending ||
                (openaiAuthMode === "api_key" ? openaiKeyInput.length === 0 : authJsonInput.length === 0)
              }
              onClick={() => void saveOpenaiMutation.mutateAsync()}
              type="button"
            >
              Validate & Save
            </button>
          </div>
        </div>
      );
    }

    if (step === "github-token") {
      return (
        <div className={styles.contentStack}>
          <StepTitle title="Add GitHub access" badge="Optional" />
          <p className={styles.subtitle}>
            Add a token to enable automatic PR creation. You can skip this and add it later from Credentials.
          </p>
          <label className={styles.field} htmlFor="setup-github-token">
            <span className={styles.fieldLabel}>Personal access token</span>
            <input
              className={styles.input}
              id="setup-github-token"
              onChange={(event) => setGithubTokenInput(event.target.value)}
              placeholder="ghp_… or github_pat_…"
              type="password"
              value={githubTokenInput}
            />
          </label>
          <div className={styles.actionsRow}>
            <button className={styles.secondaryButton} onClick={() => setStep("done")} type="button">
              Skip for now
            </button>
            <button
              className={styles.primaryButton}
              disabled={githubTokenInput.length === 0 || saveGithubMutation.isPending}
              onClick={() => void saveGithubMutation.mutateAsync()}
              type="button"
            >
              Validate & Save
            </button>
          </div>
        </div>
      );
    }

    if (step === "done") {
      return (
        <div className={styles.contentStack}>
          <div className={styles.doneIcon}>✓</div>
          <h1 className={styles.doneTitle}>You&apos;re all set</h1>
          <p className={styles.subtitle}>Symphony is connected and polling. Here&apos;s how it works:</p>
          <div className={styles.flowDiagram}>
            <FlowStep icon="📋" label="Linear Issue" sublabel="Create or tag" />
            <span className={styles.flowArrow}>→</span>
            <FlowStep icon="🎵" label="Symphony" sublabel="Agent works" />
            <span className={styles.flowArrow}>→</span>
            <FlowStep icon="🐙" label="GitHub PR" sublabel="Results delivered" />
          </div>
          <div className={styles.quickStartGrid}>
            <QuickActionCard
              buttonLabel="Create test issue"
              createdLabel={testIssueIdentifier ? `Created ${testIssueIdentifier}` : null}
              createdLink={testIssueUrl}
              description="Creates a Linear issue and moves it to In Progress."
              icon="⚡"
              loading={createTestIssueMutation.isPending}
              onClick={() => void createTestIssueMutation.mutateAsync()}
              title="Create a test issue"
            />
            <QuickActionCard
              buttonLabel="Create label"
              createdLabel={labelName ? `Label ${labelName} ready` : null}
              description="Adds a symphony label to your Linear team for tagged issues."
              icon="🏷️"
              loading={createLabelMutation.isPending}
              onClick={() => void createLabelMutation.mutateAsync()}
              title="Create Symphony label"
            />
          </div>
          <div className={styles.actionsRow}>
            <button className={styles.secondaryButton} onClick={() => void resetMutation.mutateAsync()} type="button">
              Reset & Re-run Setup
            </button>
            <button className={styles.primaryButton} onClick={() => navigate("/")} type="button">
              Go to Dashboard →
            </button>
          </div>
        </div>
      );
    }

    return (
      <PassiveStep
        onContinue={() =>
          setStep(
            step === "agent-config"
              ? "sandbox-safety"
              : step === "sandbox-safety"
                ? "prompt-template"
                : step === "prompt-template"
                  ? "workspace-hooks"
                  : "done",
          )
        }
        title={
          step === "agent-config"
            ? "Agent configuration"
            : step === "sandbox-safety"
              ? "Sandbox safety"
              : "Workspace hooks"
        }
      />
    );
  }

  if (statusQuery.isLoading && generatedKey === null) {
    return <section className={styles.state}>Loading setup wizard…</section>;
  }

  return (
    <section className={styles.page} aria-labelledby="setup-title" data-testid="setup-route">
      {step === "master-key" ? (
        <header className={styles.intro}>
          <p className={styles.introEyebrow}>Setup sequence</p>
          <h1 className={styles.introTitle} id="setup-title">
            Bring Symphony online
          </h1>
          <p className={styles.introText}>
            Connect Linear, secure local credentials, and define how sandboxed agents turn tracked work into pull
            requests.
          </p>
          <div className={styles.introTags}>
            <span className={styles.introTag}>Local control plane</span>
            <span className={styles.introTag}>Encrypted secrets</span>
            <span className={styles.introTag}>Sandboxed execution</span>
          </div>
        </header>
      ) : null}

      {notice ? (
        <div className={notice.tone === "error" ? styles.noticeError : styles.noticeSuccess}>{notice.message}</div>
      ) : null}

      {step !== "done" ? (
        <div className={styles.stepRow}>
          {STEP_ITEMS.map((item, index) => (
            <div className={styles.stepShell} key={item.key}>
              <button
                className={
                  index === currentStepIndex
                    ? `${styles.stepButton} ${styles.stepButtonActive}`
                    : index < currentStepIndex
                      ? `${styles.stepButton} ${styles.stepButtonDone}`
                      : styles.stepButton
                }
                onClick={() => setStep(item.key)}
                type="button"
              >
                <span className={styles.stepDot}>{index < currentStepIndex ? "✓" : index + 1}</span>
                <span className={styles.stepCopy}>
                  <span className={styles.stepMeta}>{`Step ${String(index + 1).padStart(2, "0")}`}</span>
                  <span className={styles.stepLabel}>{item.label}</span>
                </span>
              </button>
              {index < STEP_ITEMS.length - 1 ? (
                <span
                  className={
                    index < currentStepIndex
                      ? `${styles.stepConnector} ${styles.stepConnectorDone}`
                      : styles.stepConnector
                  }
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.panel}>{renderStepContent()}</div>
    </section>
  );
}

function StepTitle({ badge, title }: Readonly<{ badge: string; title: string }>): ReactElement {
  return (
    <div className={styles.titleRow}>
      <h2 className={styles.title}>{title}</h2>
      <span className={badge === "Required" ? styles.requiredBadge : styles.optionalBadge}>{badge}</span>
    </div>
  );
}

function FlowStep({
  icon,
  label,
  sublabel,
}: Readonly<{ icon: string; label: string; sublabel: string }>): ReactElement {
  return (
    <div className={styles.flowStep}>
      <span className={styles.flowIcon}>{icon}</span>
      <span className={styles.flowLabel}>{label}</span>
      <span className={styles.flowSublabel}>{sublabel}</span>
    </div>
  );
}

function QuickActionCard({
  buttonLabel,
  createdLabel,
  createdLink,
  description,
  icon,
  loading,
  onClick,
  title,
}: Readonly<{
  buttonLabel: string;
  createdLabel: string | null;
  createdLink?: string | null;
  description: string;
  icon: string;
  loading: boolean;
  onClick: () => void;
  title: string;
}>): ReactElement {
  return (
    <article className={styles.quickActionCard}>
      <span className={styles.quickActionIcon}>{icon}</span>
      <div className={styles.quickActionCopy}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionDescription}>{description}</p>
      </div>
      {createdLabel ? (
        <p className={styles.successText}>
          {createdLabel}
          {createdLink ? (
            <a className={styles.inlineLink} href={createdLink} rel="noreferrer" target="_blank">
              {" "}
              View →
            </a>
          ) : null}
        </p>
      ) : (
        <button className={styles.primaryButton} disabled={loading} onClick={onClick} type="button">
          {loading ? "Creating…" : buttonLabel}
        </button>
      )}
    </article>
  );
}

function CreateProjectPanel({
  loading,
  onCreate,
}: Readonly<{ loading: boolean; onCreate: (name: string) => void }>): ReactElement {
  const [name, setName] = useState<string>("");

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setName(event.target.value);
  }

  return (
    <div className={styles.createProjectPanel}>
      <p className={styles.sectionDescription}>
        <strong>No projects found.</strong> Create one here or in Linear directly.
      </p>
      <div className={styles.createProjectRow}>
        <input className={styles.input} onChange={handleChange} placeholder="Project name" value={name} />
        <button
          className={styles.primaryButton}
          disabled={loading || name.trim().length === 0}
          onClick={() => onCreate(name.trim())}
          type="button"
        >
          {loading ? "Creating…" : "Create project"}
        </button>
      </div>
    </div>
  );
}

function PassiveStep({ onContinue, title }: Readonly<{ onContinue: () => void; title: string }>): ReactElement {
  return (
    <div className={styles.contentStack}>
      <StepTitle badge="Optional" title={title} />
      <p className={styles.subtitle}>These settings are optional and can be changed later from Settings.</p>
      <div className={styles.actionsRow}>
        <button className={styles.primaryButton} onClick={onContinue} type="button">
          Continue →
        </button>
      </div>
    </div>
  );
}
