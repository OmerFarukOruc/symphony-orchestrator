import { buildSetupError } from "./setup-shared.js";

export interface DoneStepState {
  testIssueLoading: boolean;
  testIssueCreated: boolean;
  testIssueIdentifier: string | null;
  testIssueUrl: string | null;
  testIssueError: string | null;
  labelLoading: boolean;
  labelCreated: boolean;
  labelName: string | null;
  labelError: string | null;
}

export interface DoneStepActions {
  onCreateTestIssue: () => void;
  onCreateLabel: () => void;
  onOpenDashboard: () => void;
  onResetSetup: () => void;
}

/** Builds the three-step flow diagram for the done screen. */
export function buildFlowDiagram(): HTMLElement {
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
      arrow.textContent = "\u2192";
      flow.append(arrow);
    }
  }

  return flow;
}

interface QuickStartCardOpts {
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
}

/** Builds a single quick-start action card for the done screen. */
export function buildQuickStartCard(opts: QuickStartCardOpts): HTMLElement {
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

/**
 * Builds the setup-complete "done" step DOM.
 * Pure function — takes state and action callbacks, returns an HTMLElement.
 */
export function buildDoneStep(state: DoneStepState, actions: DoneStepActions): HTMLElement {
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
    onClick: () => actions.onCreateTestIssue(),
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
    onClick: () => actions.onCreateLabel(),
  });

  cards.append(testIssueCard, labelCard);

  const goBtn = document.createElement("button");
  goBtn.className = "mc-button is-primary setup-done-action";
  goBtn.type = "button";
  goBtn.textContent = "Open dashboard →";
  goBtn.addEventListener("click", () => actions.onOpenDashboard());

  const divider = document.createElement("hr");
  divider.className = "setup-divider";

  const resetBtn = document.createElement("button");
  resetBtn.className = "mc-button is-ghost is-sm setup-reset-btn";
  resetBtn.type = "button";
  resetBtn.textContent = "Reset setup";
  resetBtn.addEventListener("click", () => actions.onResetSetup());

  el.append(icon, title, desc, flow, quickStartLabel, cards, goBtn, divider, resetBtn);
  return el;
}
