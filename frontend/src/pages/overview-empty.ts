import { router } from "../router";

const EMPTY_STATE_DISMISSED_KEY = "risoluto-empty-state-dismissed";

/** Returns true if the user has already dismissed the getting started card. */
export function isGettingStartedDismissed(): boolean {
  return localStorage.getItem(EMPTY_STATE_DISMISSED_KEY) === "true";
}

/** Persists the getting started dismissal to localStorage. */
export function dismissGettingStarted(): void {
  localStorage.setItem(EMPTY_STATE_DISMISSED_KEY, "true");
}

/**
 * Creates a teaching empty state card with an optional CTA button.
 */
export function createTeachingEmptyState(
  title: string,
  detail: string,
  actionLabel?: string,
  onAction?: () => void,
): HTMLElement {
  const box = document.createElement("div");
  box.className = "overview-teaching-empty";

  const heading = document.createElement("h3");
  heading.className = "overview-teaching-empty-title";
  heading.textContent = title;

  const text = document.createElement("p");
  text.className = "overview-teaching-empty-detail";
  text.textContent = detail;

  box.append(heading, text);

  if (actionLabel && onAction) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mc-button";
    button.textContent = actionLabel;
    button.addEventListener("click", onAction);
    box.append(button);
  }

  return box;
}

/**
 * Creates the full getting started onboarding card shown on an empty dashboard.
 * Calls `onDismiss` when the user clicks the dismiss button.
 */
export function createGettingStartedCard(onDismiss: () => void): HTMLElement {
  const card = document.createElement("div");
  card.className = "overview-getting-started";

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "overview-getting-started-dismiss";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss tip");
  dismiss.addEventListener("click", () => {
    dismissGettingStarted();
    onDismiss();
  });

  const heading = document.createElement("h2");
  heading.className = "overview-getting-started-title";
  heading.textContent = "Ready when you are";

  const desc = document.createElement("p");
  desc.className = "overview-getting-started-desc";
  desc.textContent =
    "Create an issue in Linear, move it into progress, and Risoluto picks it up on the next poll. This page turns into a live readout the moment work begins.";

  const steps = document.createElement("div");
  steps.className = "overview-getting-started-steps";

  const stepItems = [
    { n: "1", text: "Create an issue in Linear" },
    { n: "2", text: "Move it to In Progress" },
    { n: "3", text: "Watch the first run land here" },
  ];

  for (const s of stepItems) {
    const step = document.createElement("div");
    step.className = "overview-getting-started-step delight-stagger";
    step.style.setProperty("--step-index", s.n);
    const dot = document.createElement("span");
    dot.className = "overview-getting-started-step-n";
    dot.textContent = s.n;
    const label = document.createElement("span");
    label.textContent = s.text;
    step.append(dot, label);
    steps.append(step);
  }

  const cta = document.createElement("div");
  cta.className = "overview-getting-started-actions";

  const setupBtn = document.createElement("button");
  setupBtn.className = "mc-button is-ghost is-sm";
  setupBtn.type = "button";
  setupBtn.textContent = "Review setup";
  setupBtn.addEventListener("click", () => {
    router.navigate("/setup");
  });

  cta.append(setupBtn);

  card.append(dismiss, heading, desc, steps, cta);
  return card;
}
