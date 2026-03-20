import { api } from "../api";
import { router } from "../router";

type SetupStep = "master-key" | "linear-project" | "github-token" | "done";

interface SetupState {
  step: SetupStep;
  loading: boolean;
  error: string | null;
  generatedKey: string | null;
  apiKeyInput: string;
  projects: Array<{ id: unknown; name: unknown; slugId: string; teamKey: unknown }>;
  selectedProject: string | null;
  tokenInput: string;
}

const state: SetupState = {
  step: "master-key",
  loading: false,
  error: null,
  generatedKey: null,
  apiKeyInput: "",
  projects: [],
  selectedProject: null,
  tokenInput: "",
};

let container: HTMLElement | null = null;

function rerender(): void {
  if (!container) return;
  container.replaceChildren(buildPage());
}

function setLoading(loading: boolean): void {
  state.loading = loading;
  rerender();
}

function _setError(msg: string | null): void {
  state.error = msg;
  rerender();
}

// ── Step indicator ────────────────────────────────────────────────────────────

function buildStepIndicator(): HTMLElement {
  const steps: Array<{ key: SetupStep; label: string; n: string }> = [
    { key: "master-key", label: "Master Key", n: "1" },
    { key: "linear-project", label: "Linear", n: "2" },
    { key: "github-token", label: "GitHub", n: "3" },
  ];

  const order: SetupStep[] = ["master-key", "linear-project", "github-token", "done"];
  const currentIdx = order.indexOf(state.step);

  const row = document.createElement("div");
  row.className = "setup-steps";

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const stepIdx = order.indexOf(s.key);
    const isDone = currentIdx > stepIdx;
    const isActive = s.key === state.step;

    const indicator = document.createElement("div");
    indicator.className = `setup-step-indicator${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}`;

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

  const title = document.createElement("div");
  title.className = "setup-title";
  title.textContent = "Set Master Key";

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.textContent = "Symphony encrypts your secrets with this key. A random key has been generated for you.";

  const callout = document.createElement("div");
  callout.className = "setup-callout";
  callout.innerHTML =
    "<strong>Important:</strong> Save this key somewhere safe. It cannot be recovered if lost — you will need to delete <code>.symphony/secrets.enc</code> and re-enter your secrets.";

  const keyDisplay = document.createElement("div");
  keyDisplay.className = "setup-key-display";

  const keyValue = document.createElement("div");
  keyValue.className = "setup-key-value";
  keyValue.textContent = state.generatedKey ?? "Generating…";

  const copyBtn = document.createElement("button");
  copyBtn.className = "mc-button is-ghost is-sm";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => {
    if (state.generatedKey) {
      void navigator.clipboard.writeText(state.generatedKey);
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
  regen.textContent = "Regenerate";
  regen.disabled = state.loading;
  regen.addEventListener("click", () => void generateAndSetKey());

  const next = document.createElement("button");
  next.className = "mc-button is-primary";
  next.textContent = state.loading ? "Saving…" : "Next →";
  next.disabled = state.loading || !state.generatedKey;
  next.addEventListener("click", () => advanceMasterKey());

  actions.append(regen, next);

  if (state.error) {
    const err = document.createElement("div");
    err.className = "setup-error";
    err.textContent = state.error;
    el.append(title, sub, callout, keyDisplay, err, actions);
  } else {
    el.append(title, sub, callout, keyDisplay, actions);
  }

  return el;
}

async function generateAndSetKey(): Promise<void> {
  setLoading(true);
  state.error = null;
  try {
    const result = await api.postMasterKey();
    state.generatedKey = result.key;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    setLoading(false);
  }
}

function advanceMasterKey(): void {
  if (!state.generatedKey) return;
  state.step = "linear-project";
  state.error = null;
  rerender();
}

// ── Step: Linear Project ─────────────────────────────────────────────────────

function buildLinearProjectStep(): HTMLElement {
  const el = document.createElement("div");

  const title = document.createElement("div");
  title.className = "setup-title";
  title.textContent = "Connect Linear Project";

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.textContent = "Enter your Linear API key to load your projects, then select one to track.";

  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.textContent = "Linear API Key";

  const input = document.createElement("input");
  input.className = "setup-input";
  input.type = "password";
  input.placeholder = "lin_api_…";
  input.value = state.apiKeyInput;
  input.addEventListener("input", () => {
    state.apiKeyInput = input.value;
  });

  const loadBtn = document.createElement("button");
  loadBtn.className = "mc-button is-ghost is-sm";
  loadBtn.style.marginTop = "var(--space-2)";
  loadBtn.textContent = state.loading ? "Loading…" : "Load Projects";
  loadBtn.disabled = state.loading;
  loadBtn.addEventListener("click", () => void loadLinearProjects());

  field.append(label, input, loadBtn);

  el.append(title, sub, field);

  if (state.projects.length > 0) {
    const grid = document.createElement("div");
    grid.className = "setup-project-grid";

    for (const p of state.projects) {
      const card = document.createElement("div");
      card.className = `setup-project-card${state.selectedProject === p.slugId ? " is-selected" : ""}`;

      const name = document.createElement("div");
      name.className = "setup-project-name";
      name.textContent = String(p.name);

      const slug = document.createElement("div");
      slug.className = "setup-project-slug";
      slug.textContent = p.slugId;

      card.append(name, slug);
      card.addEventListener("click", () => {
        state.selectedProject = p.slugId;
        rerender();
      });
      grid.append(card);
    }
    el.append(grid);
  }

  if (state.error) {
    const err = document.createElement("div");
    err.className = "setup-error";
    err.textContent = state.error;
    el.append(err);
  }

  const actions = document.createElement("div");
  actions.className = "setup-actions";

  const skip = document.createElement("button");
  skip.className = "mc-button is-ghost is-sm";
  skip.textContent = "Skip";
  skip.addEventListener("click", () => {
    state.step = "github-token";
    state.error = null;
    rerender();
  });

  const next = document.createElement("button");
  next.className = "mc-button is-primary";
  next.textContent = state.loading ? "Saving…" : "Next →";
  next.disabled = state.loading || !state.selectedProject;
  next.addEventListener("click", () => void advanceLinearProject());

  actions.append(skip, next);
  el.append(actions);

  return el;
}

async function loadLinearProjects(): Promise<void> {
  if (!state.apiKeyInput) return;
  setLoading(true);
  state.error = null;
  // Store the API key in secrets first so the backend can use it
  try {
    await api.postSecret("LINEAR_API_KEY", state.apiKeyInput);
    const result = await api.getLinearProjects();
    state.projects = result.projects;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
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
    state.step = "github-token";
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    setLoading(false);
  }
}

// ── Step: GitHub Token ───────────────────────────────────────────────────────

function buildGithubTokenStep(): HTMLElement {
  const el = document.createElement("div");

  const title = document.createElement("div");
  title.className = "setup-title";
  title.textContent = "GitHub Token (optional)";

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.innerHTML =
    "Add a GitHub personal access token to enable PR creation. " +
    '<a class="setup-link" href="https://github.com/settings/tokens/new?scopes=repo&description=Symphony+Orchestrator" target="_blank" rel="noopener">Generate token →</a>';

  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.textContent = "Personal Access Token";

  const input = document.createElement("input");
  input.className = "setup-input";
  input.type = "password";
  input.placeholder = "ghp_…";
  input.value = state.tokenInput;
  input.addEventListener("input", () => {
    state.tokenInput = input.value;
  });

  field.append(label, input);
  el.append(title, sub, field);

  if (state.error) {
    const err = document.createElement("div");
    err.className = "setup-error";
    err.textContent = state.error;
    el.append(err);
  }

  const actions = document.createElement("div");
  actions.className = "setup-actions";

  const skip = document.createElement("button");
  skip.className = "mc-button is-ghost is-sm";
  skip.textContent = "Skip";
  skip.addEventListener("click", () => {
    state.step = "done";
    state.error = null;
    rerender();
  });

  const validate = document.createElement("button");
  validate.className = "mc-button is-primary";
  validate.textContent = state.loading ? "Validating…" : "Validate & Save";
  validate.disabled = state.loading || !state.tokenInput;
  validate.addEventListener("click", () => void advanceGithubToken());

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

function buildDoneStep(): HTMLElement {
  const el = document.createElement("div");
  el.className = "setup-done";

  const icon = document.createElement("div");
  icon.className = "setup-done-icon";
  icon.textContent = "✓";
  icon.style.color = "var(--status-running)";

  const title = document.createElement("div");
  title.className = "setup-done-title";
  title.textContent = "Setup complete";

  const desc = document.createElement("div");
  desc.className = "setup-done-desc";
  desc.textContent = "Symphony is configured and ready to orchestrate.";

  const goBtn = document.createElement("button");
  goBtn.className = "mc-button is-primary";
  goBtn.style.marginTop = "var(--space-5)";
  goBtn.textContent = "Go to Dashboard →";
  goBtn.addEventListener("click", () => {
    router.navigate("/");
  });

  el.append(icon, title, desc, goBtn);
  return el;
}

// ── Main render ──────────────────────────────────────────────────────────────

function buildStepContent(): HTMLElement {
  switch (state.step) {
    case "master-key":
      return buildMasterKeyStep();
    case "linear-project":
      return buildLinearProjectStep();
    case "github-token":
      return buildGithubTokenStep();
    case "done":
      return buildDoneStep();
  }
}

function buildPage(): HTMLElement {
  const wrap = document.createElement("div");

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

  // Auto-generate a key on first load
  void (async () => {
    if (!state.generatedKey) {
      await generateAndSetKey();
    } else {
      rerender();
    }
  })();

  page.append(buildPage());
  return page;
}
