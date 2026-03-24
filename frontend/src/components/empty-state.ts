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

const EMPTY_STATE_KICKERS = {
  default: "Standby",
  queue: "Board ready",
  terminal: "Archive calm",
  events: "Signal quiet",
  attention: "Clear runway",
  error: "Needs attention",
  network: "Connection pending",
} as const satisfies Record<EmptyStateVariant, string>;

interface StateBoxConfig {
  containerClass: string;
  iconClass: string;
  kickerClass: string;
  headingClass: string;
  textClass: string;
  iconName: IconName;
  kicker: string;
  title: string;
  detail: string;
  variant: EmptyStateVariant;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  secondaryActionHref?: string;
}

export interface EmptyStateOptions {
  secondaryActionLabel?: string;
  secondaryActionHref?: string;
}

function buildStateBox(config: StateBoxConfig): HTMLElement {
  const box = document.createElement("div");
  box.className = config.containerClass;
  box.dataset.emptyVariant = config.variant;

  const icon = document.createElement("div");
  icon.className = config.iconClass;
  icon.setAttribute("aria-hidden", "true");
  icon.append(createIcon(config.iconName, { size: 32 }));

  const kicker = document.createElement("span");
  kicker.className = config.kickerClass;
  kicker.textContent = config.kicker;

  const heading = document.createElement("h3");
  heading.className = config.headingClass;
  heading.textContent = config.title;

  const text = document.createElement("p");
  text.className = config.textClass;
  text.textContent = config.detail;

  box.append(icon, kicker, heading, text);

  if (config.actionLabel && config.onAction) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mc-button is-primary";
    button.textContent = config.actionLabel;
    button.addEventListener("click", config.onAction);
    box.append(button);
  }

  if (config.secondaryActionLabel && config.secondaryActionHref) {
    const link = document.createElement("a");
    link.className = "mc-button is-ghost";
    link.href = config.secondaryActionHref;
    link.textContent = config.secondaryActionLabel;
    box.append(link);
  }

  return box;
}

export function createEmptyState(
  title: string,
  detail: string,
  actionLabel?: string,
  onAction?: () => void,
  variant: EmptyStateVariant = "default",
  options: EmptyStateOptions = {},
): HTMLElement {
  const iconName = EMPTY_STATE_ICONS[variant] ?? EMPTY_STATE_ICONS.default;
  const box = buildStateBox({
    containerClass: "mc-empty-state",
    iconClass: "mc-empty-state-icon",
    kickerClass: "mc-empty-state-kicker",
    headingClass: "mc-empty-state-title",
    textClass: "mc-empty-state-detail",
    iconName,
    kicker: EMPTY_STATE_KICKERS[variant],
    title,
    detail,
    variant,
    actionLabel,
    onAction,
    secondaryActionLabel: options.secondaryActionLabel,
    secondaryActionHref: options.secondaryActionHref,
  });
  return box;
}
