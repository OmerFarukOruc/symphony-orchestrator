export function buildTitleWithBadge(
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

export function buildSetupError(message: string): HTMLElement {
  const err = document.createElement("div");
  err.className = "setup-error";
  err.textContent = message;
  err.setAttribute("role", "alert");
  err.setAttribute("aria-live", "assertive");
  err.setAttribute("aria-atomic", "true");
  err.tabIndex = -1;

  queueMicrotask(() => {
    if (err.isConnected) {
      err.focus();
    }
  });

  return err;
}
