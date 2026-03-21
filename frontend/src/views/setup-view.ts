import { api } from "../api";
import { router } from "../router";

type SetupStep = "master-key" | "linear-project" | "github-token" | "done";

interface SetupState {
  step: SetupStep;
  loading: boolean;
  error: string | null;
  generatedKey: string | null;
  apiKeyInput: string;
  apiKeyVerified: boolean;
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
  apiKeyVerified: false,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTitleWithBadge(
  text: string,
  badgeClass: "is-required" | "is-optional",
  badgeText: string,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "setup-title-row";

  const title = document.createElement("div");
  title.className = "setup-title";
  title.textContent = text;

  const badge = document.createElement("span");
  badge.className = `setup-badge ${badgeClass}`;
  badge.textContent = badgeText;

  row.append(title, badge);
  return row;
}

// ── Step indicator ────────────────────────────────────────────────────────────

function buildStepIndicator(): HTMLElement {
  const steps: Array<{ key: SetupStep; label: string; n: string }> = [
    { key: "master-key", label: "Protect secrets", n: "1" },
    { key: "linear-project", label: "Connect Linear", n: "2" },
    { key: "github-token", label: "Add GitHub", n: "3" },
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
  title.textContent = "Protect your secrets";

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.textContent = "Symphony uses an encryption key to protect stored credentials on your machine. A key has been generated for you — copy it somewhere safe before continuing.";

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

  const titleRow = buildTitleWithBadge("Connect to Linear", "is-required", "Required");

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.innerHTML =
    "Enter your Linear API key and choose the project Symphony should track. " +
    '<a class="setup-link" href="https://linear.app/settings/account/security/api-keys/new" target="_blank" rel="noopener">Create a personal API key →</a>';

  const callout = document.createElement("div");
  callout.className = "setup-callout";
  callout.innerHTML =
    "When creating the key, enable <strong>Read</strong> and <strong>Write</strong> permissions " +
    "with <strong>All teams you have access to</strong> selected.";

  // ── API key input row ──
  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.textContent = "Linear API Key";

  const inputRow = document.createElement("div");
  inputRow.style.cssText = "display:flex;gap:var(--space-2);align-items:center;";

  // Inline status badge
  const statusBadge = document.createElement("div");
  statusBadge.className = "setup-key-status";
  if (state.loading) {
    statusBadge.textContent = "Verifying…";
    statusBadge.style.color = "var(--text-muted)";
  } else if (state.apiKeyVerified) {
    statusBadge.textContent = "✓ Valid";
    statusBadge.style.color = "var(--status-running)";
  } else if (state.error) {
    statusBadge.textContent = "✗ Invalid";
    statusBadge.style.color = "var(--status-blocked)";
  }

  const verifyBtn = document.createElement("button");
  verifyBtn.className = "mc-button is-primary is-sm";
  verifyBtn.style.marginTop = "var(--space-2)";
  verifyBtn.textContent = state.loading ? "Verifying…" : state.apiKeyVerified ? "Re-verify" : "Verify Key";
  verifyBtn.disabled = state.loading || !state.apiKeyInput;
  verifyBtn.addEventListener("click", () => void loadLinearProjects());

  const input = document.createElement("input");
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

  // Error shown under the verify button
  if (state.error && !state.apiKeyVerified) {
    const err = document.createElement("div");
    err.className = "setup-error";
    err.textContent = state.error;
    el.append(err);
  }

  // Project grid — only shown after successful verify
  if (state.apiKeyVerified && state.projects.length > 0) {
    const gridLabel = document.createElement("div");
    gridLabel.className = "setup-label";
    gridLabel.style.marginTop = "var(--space-4)";
    gridLabel.textContent = "Select a project";

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
    el.append(gridLabel, grid);
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

  const titleRow = buildTitleWithBadge("Add GitHub access", "is-optional", "Optional");

  const sub = document.createElement("div");
  sub.className = "setup-subtitle";
  sub.textContent = "Add a token to enable automatic PR creation. You can skip this and add it later from Credentials.";

  const optionWrap = document.createElement("div");
  optionWrap.style.cssText =
    "display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-4)";

  const optA = document.createElement("div");
  optA.style.cssText =
    "border:var(--stroke-default) solid var(--border-stitch);padding:var(--space-3);background:var(--bg-muted)";
  optA.innerHTML =
    '<div style="font-family:var(--font-body);font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-2)">' +
    'Fine-grained <span style="font-weight:400;color:var(--text-muted);font-size:var(--text-xs)">(recommended)</span></div>' +
    '<a class="setup-link" style="display:inline-block;margin-bottom:var(--space-3)" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create token →</a>' +
    '<ol style="margin:0;padding-left:var(--space-4);font-family:var(--font-body);font-size:var(--text-xs);color:var(--text-secondary);line-height:1.8">' +
    "<li>Name it <strong>Symphony</strong></li>" +
    "<li>Repository access → <strong>Only select repositories</strong> → pick repos</li>" +
    "<li>Permissions → Repository → <strong>Contents</strong> and <strong>Pull requests</strong>: Read and write</li>" +
    "<li>Generate token</li>" +
    "</ol>";

  const optB = document.createElement("div");
  optB.style.cssText =
    "border:var(--stroke-default) solid var(--border-stitch);padding:var(--space-3);background:var(--bg-muted)";
  optB.innerHTML =
    '<div style="font-family:var(--font-body);font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-2)">Classic</div>' +
    '<a class="setup-link" style="display:inline-block;margin-bottom:var(--space-3)" href="https://github.com/settings/tokens/new?scopes=repo&description=Symphony+Orchestrator" target="_blank" rel="noopener">Create token →</a>' +
    '<ol style="margin:0;padding-left:var(--space-4);font-family:var(--font-body);font-size:var(--text-xs);color:var(--text-secondary);line-height:1.8">' +
    "<li>Check the <strong>repo</strong> scope</li>" +
    "<li>Generate token</li>" +
    "</ol>";

  optionWrap.append(optA, optB);

  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.textContent = "Personal Access Token";

  const validate = document.createElement("button");
  validate.className = "mc-button is-primary";
  validate.textContent = state.loading ? "Validating…" : "Validate & Save";
  validate.disabled = state.loading || !state.tokenInput;
  validate.addEventListener("click", () => void advanceGithubToken());

  const input = document.createElement("input");
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
    const err = document.createElement("div");
    err.className = "setup-error";
    err.textContent = state.error;
    el.append(err);
  }

  const actions = document.createElement("div");
  actions.className = "setup-actions";

  const skip = document.createElement("button");
  skip.className = "mc-button is-ghost is-sm";
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
  desc.textContent = "Symphony is connected and ready. Next: create a workflow file and start Symphony from your terminal.";

  const code = document.createElement("pre");
  code.className = "mc-code-panel setup-done-code";
  code.textContent = "node dist/cli.js ./WORKFLOW.example.md --port 4000";

  const docLink = document.createElement("a");
  docLink.className = "setup-link";
  docLink.textContent = "View workflow file documentation →";
  docLink.href = "#";
  docLink.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/planner");
  });

  const goBtn = document.createElement("button");
  goBtn.className = "mc-button is-primary";
  goBtn.style.marginTop = "var(--space-5)";
  goBtn.textContent = "Go to Dashboard →";
  goBtn.addEventListener("click", () => {
    router.navigate("/");
  });

  el.append(icon, title, desc, code, docLink, goBtn);
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

  // Drive step from server state on every load
  void api
    .getSetupStatus()
    .then((status) => {
      if (!status.steps.masterKey.done) {
        if (!state.generatedKey) void generateAndSetKey();
        return;
      }
      // Master key exists — always derive correct step from server
      state.generatedKey = state.generatedKey ?? "set";
      if (!status.steps.linearProject.done) {
        state.step = "linear-project";
      } else if (!status.steps.githubToken.done) {
        state.step = "github-token";
      } else {
        state.step = "done";
      }
      rerender();
    })
    .catch(() => {
      if (!state.generatedKey) void generateAndSetKey();
    });

  page.append(buildPage());
  return page;
}
