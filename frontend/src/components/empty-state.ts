import { createIcon, type IconName } from "../ui/icons";

const EMPTY_STATE_ICONS = {
  default: "emptyDefault",
  queue: "emptyQueue",
  terminal: "emptyTerminal",
  events: "emptyEvents",
  attention: "emptyAttention",
  error: "emptyError",
  network: "emptyNetwork",
} as const satisfies Record<string, IconName>;

type EmptyStateVariant = keyof typeof EMPTY_STATE_ICONS;

interface StateBoxConfig {
  containerClass: string;
  iconClass: string;
  headingClass: string;
  textClass: string;
  iconName: IconName;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}

function buildStateBox(config: StateBoxConfig): HTMLElement {
  const box = document.createElement("div");
  box.className = config.containerClass;

  const icon = document.createElement("div");
  icon.className = config.iconClass;
  icon.setAttribute("aria-hidden", "true");
  icon.append(createIcon(config.iconName, { size: 32 }));

  const heading = document.createElement("h3");
  heading.className = config.headingClass;
  heading.style.maxWidth = "100%";
  heading.textContent = config.title;

  const text = document.createElement("p");
  text.className = config.textClass;
  text.textContent = config.detail;

  box.append(icon, heading, text);

  if (config.actionLabel && config.onAction) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mc-button mc-button-ghost";
    button.textContent = config.actionLabel;
    button.addEventListener("click", config.onAction);
    box.append(button);
  }

  return box;
}

export function createEmptyState(
  title: string,
  detail: string,
  actionLabel?: string,
  onAction?: () => void,
  variant: EmptyStateVariant = "default",
): HTMLElement {
  const iconName = EMPTY_STATE_ICONS[variant] ?? EMPTY_STATE_ICONS.default;
  const box = buildStateBox({
    containerClass: "mc-empty-state",
    iconClass: "mc-empty-state-icon",
    headingClass: "text-truncate",
    textClass: "text-secondary text-wrap",
    iconName,
    title,
    detail,
    actionLabel,
    onAction,
  });
  const textEl = box.querySelector("p");
  if (textEl) {
    textEl.style.maxWidth = "50ch";
  }
  return box;
}

export function createErrorState(title: string, message: string, retryAction?: () => void): HTMLElement {
  const box = buildStateBox({
    containerClass: "error-state",
    iconClass: "error-state-icon",
    headingClass: "error-state-title text-truncate",
    textClass: "error-state-message",
    iconName: EMPTY_STATE_ICONS.error,
    title,
    detail: message,
  });

  if (retryAction) {
    const actions = document.createElement("div");
    actions.className = "error-state-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mc-button mc-button-ghost";
    button.textContent = "Retry";
    button.addEventListener("click", retryAction);
    actions.append(button);
    box.append(actions);
  }

  return box;
}

function createNetworkErrorState(retryAction?: () => void): HTMLElement {
  return createErrorState(
    "Connection issue",
    "Unable to connect to the server. Please check your network connection and try again.",
    retryAction,
  );
}
