import type { LinearProject } from "../types/setup.js";
import { buildSetupError, buildTitleWithBadge } from "./setup-shared";

export interface LinearStepState {
  loading: boolean;
  error: string | null;
  apiKeyInput: string;
  apiKeyVerified: boolean;
  projects: LinearProject[];
  selectedProject: string | null;
  createdProjectName: string | null;
  createdProjectUrl: string | null;
}

export interface LinearStepActions {
  onApiKeyInput: (value: string) => void;
  onVerifyKey: () => void;
  onSelectProject: (slugId: string) => void;
  onCreateProject: (name: string) => void;
  onAdvance: () => void;
  onSkip: () => void;
}

function buildStatusBadge(state: LinearStepState): HTMLElement {
  const badge = document.createElement("div");
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

  return badge;
}

function buildProjectGrid(state: LinearStepState, actions: LinearStepActions, gridLabelId: string): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "setup-project-grid";
  grid.setAttribute("role", "radiogroup");
  grid.setAttribute("aria-labelledby", gridLabelId);

  for (const project of state.projects) {
    const isSelected = state.selectedProject === project.slugId;
    const card = document.createElement("div");
    card.className = `setup-project-card${isSelected ? " is-selected" : ""}`;
    card.setAttribute("role", "radio");
    card.setAttribute("tabindex", isSelected ? "0" : "-1");
    card.setAttribute("aria-checked", isSelected ? "true" : "false");

    const name = document.createElement("div");
    name.className = "setup-project-name";
    name.textContent = project.name;

    const slug = document.createElement("div");
    slug.className = "setup-project-slug";
    slug.textContent = project.slugId;

    card.append(name, slug);

    const handleSelect = (): void => actions.onSelectProject(project.slugId);
    card.addEventListener("click", handleSelect);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handleSelect();
    });

    grid.append(card);
  }

  return grid;
}

function buildSuccessBanner(state: LinearStepState): HTMLElement {
  const banner = document.createElement("div");
  banner.className = "setup-callout setup-callout-success";

  const strong = document.createElement("strong");
  strong.textContent = `Project "${state.createdProjectName}" created. `;
  const text = document.createTextNode("It's selected below and ready to use.");
  banner.append(strong, text);

  if (state.createdProjectUrl) {
    const link = document.createElement("a");
    link.className = "setup-link";
    link.href = state.createdProjectUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = " Open in Linear →";
    banner.append(link);
  }

  return banner;
}

function buildCreateProjectRow(state: LinearStepState, actions: LinearStepActions): HTMLElement {
  const createProjectNameInputId = "setup-linear-create-project-name";

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
  createBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (name) actions.onCreateProject(name);
  });

  nameField.append(nameLabel, nameInput);
  createRow.append(nameField, createBtn);

  const wrap = document.createElement("div");
  wrap.append(emptyMsg, createRow);
  return wrap;
}

function buildApiKeyField(state: LinearStepState, actions: LinearStepActions): HTMLElement {
  const apiKeyInputId = "setup-linear-api-key";

  const field = document.createElement("div");
  field.className = "setup-field";

  const label = document.createElement("label");
  label.className = "setup-label";
  label.htmlFor = apiKeyInputId;
  label.textContent = "Linear API key";

  const inputRow = document.createElement("div");
  inputRow.className = "setup-input-row";

  const statusBadge = buildStatusBadge(state);

  const input = document.createElement("input");
  input.id = apiKeyInputId;
  input.className = "setup-input setup-input-flex";
  input.type = "password";
  input.placeholder = "lin_api_…";
  input.value = state.apiKeyInput;

  const verifyBtn = document.createElement("button");
  verifyBtn.className = "mc-button is-primary is-sm setup-verify-btn";
  verifyBtn.type = "button";
  verifyBtn.textContent = state.loading ? "Checking…" : state.apiKeyVerified ? "Check again" : "Check key";
  verifyBtn.disabled = state.loading || !state.apiKeyInput;

  input.addEventListener("input", () => {
    actions.onApiKeyInput(input.value);
    verifyBtn.disabled = state.loading || !input.value;
  });

  verifyBtn.addEventListener("click", () => actions.onVerifyKey());

  inputRow.append(input, statusBadge);
  field.append(label, inputRow, verifyBtn);
  return field;
}

/**
 * Builds the Linear project setup step DOM.
 * Pure function — takes state and action callbacks, returns an HTMLElement.
 */
export function buildLinearProjectStep(state: LinearStepState, actions: LinearStepActions): HTMLElement {
  const projectGridLabelId = "setup-linear-project-grid-label";

  const el = document.createElement("div");

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

  const apiKeyField = buildApiKeyField(state, actions);

  el.append(titleRow, sub, callout, apiKeyField);

  if (state.error && !state.apiKeyVerified) {
    el.append(buildSetupError(state.error));
  }

  if (state.apiKeyVerified && state.projects.length > 0) {
    if (state.createdProjectName) {
      el.append(buildSuccessBanner(state));
    }

    const gridLabel = document.createElement("div");
    gridLabel.id = projectGridLabelId;
    gridLabel.className = "setup-label setup-section-label";
    gridLabel.textContent = "Choose a project";
    el.append(gridLabel, buildProjectGrid(state, actions, projectGridLabelId));
  } else if (state.apiKeyVerified && state.projects.length === 0) {
    el.append(buildCreateProjectRow(state, actions));
  }

  const actionsRow = document.createElement("div");
  actionsRow.className = "setup-actions";

  const skip = document.createElement("button");
  skip.className = "mc-button is-ghost is-sm setup-actions-secondary";
  skip.type = "button";
  skip.textContent = "Skip this step";
  skip.addEventListener("click", () => actions.onSkip());

  const next = document.createElement("button");
  next.className = "mc-button is-primary";
  next.type = "button";
  next.textContent = state.loading ? "Saving…" : "Continue →";
  next.disabled = state.loading || !state.selectedProject;
  next.addEventListener("click", () => actions.onAdvance());

  actionsRow.append(skip, next);
  el.append(actionsRow);

  return el;
}
