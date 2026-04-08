import { buildSetupError, buildTitleWithBadge } from "./setup-shared.js";

export interface GithubStepState {
  loading: boolean;
  error: string | null;
  tokenInput: string;
}

export interface GithubStepActions {
  onTokenInput: (value: string) => void;
  onAdvance: () => void;
  onSkip: () => void;
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

/**
 * Builds the GitHub token setup step DOM.
 * Pure function — takes state and action callbacks, returns an HTMLElement.
 */
export function buildGithubTokenStep(state: GithubStepState, actions: GithubStepActions): HTMLElement {
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
  validate.addEventListener("click", () => actions.onAdvance());

  const input = document.createElement("input");
  input.id = githubTokenInputId;
  input.className = "setup-input";
  input.type = "password";
  input.placeholder = "ghp_… or github_pat_…";
  input.value = state.tokenInput;
  input.addEventListener("input", () => {
    actions.onTokenInput(input.value);
    validate.disabled = state.loading || !input.value;
  });

  field.append(label, input);
  el.append(titleRow, sub, optionWrap, field);

  if (state.error) {
    el.append(buildSetupError(state.error));
  }

  const actionsRow = document.createElement("div");
  actionsRow.className = "setup-actions";

  const skip = document.createElement("button");
  skip.className = "mc-button is-ghost is-sm setup-actions-secondary";
  skip.type = "button";
  skip.textContent = "Skip this step";
  skip.addEventListener("click", () => actions.onSkip());

  actionsRow.append(skip, validate);
  el.append(actionsRow);

  return el;
}
