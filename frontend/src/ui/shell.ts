let outletEl: HTMLElement | null = null;
let routeAnnouncerEl: HTMLElement | null = null;

export function initShell(root: HTMLElement): { sidebarEl: HTMLElement; headerEl: HTMLElement } {
  root.innerHTML = "";

  const skipLink = document.createElement("a");
  skipLink.href = "#main-content";
  skipLink.className = "skip-link";
  skipLink.textContent = "Skip to main content";

  const sidebarEl = document.createElement("aside");
  sidebarEl.className = "shell-sidebar";
  sidebarEl.setAttribute("role", "navigation");
  sidebarEl.setAttribute("aria-label", "Primary navigation");

  const contentEl = document.createElement("div");
  contentEl.className = "shell-content";

  const bannerEl = document.createElement("div");
  bannerEl.id = "stale-banner";
  bannerEl.hidden = true;
  bannerEl.setAttribute("role", "alert");
  bannerEl.setAttribute("aria-live", "polite");

  const bannerMsg = document.createElement("span");
  bannerMsg.className = "stale-banner-message";
  bannerMsg.textContent = "State feed is stale \u2014 retrying every 5s.";

  const bannerDismiss = document.createElement("button");
  bannerDismiss.type = "button";
  bannerDismiss.className = "stale-banner-dismiss";
  bannerDismiss.textContent = "\u2715";
  bannerDismiss.setAttribute("aria-label", "Dismiss stale state banner");
  bannerDismiss.addEventListener("click", () => {
    import("../state/polling.js")
      .then((m) => m.dismissStaleBanner())
      .catch(() => {
        bannerEl.hidden = true;
      });
  });

  bannerEl.append(bannerMsg, bannerDismiss);

  const headerEl = document.createElement("header");
  headerEl.className = "shell-header";

  routeAnnouncerEl = document.createElement("div");
  routeAnnouncerEl.className = "sr-only";
  routeAnnouncerEl.setAttribute("role", "status");
  routeAnnouncerEl.setAttribute("aria-live", "polite");
  routeAnnouncerEl.setAttribute("aria-atomic", "true");

  outletEl = document.createElement("main");
  outletEl.className = "shell-outlet";
  outletEl.id = "main-content";
  outletEl.setAttribute("role", "main");
  outletEl.setAttribute("aria-label", "Main content");
  outletEl.setAttribute("tabindex", "-1");

  contentEl.append(bannerEl, headerEl, routeAnnouncerEl, outletEl);
  root.append(skipLink, sidebarEl, contentEl);

  return { sidebarEl, headerEl };
}

export function getOutlet(): HTMLElement | null {
  return outletEl;
}

export function getRouteAnnouncer(): HTMLElement | null {
  return routeAnnouncerEl;
}
