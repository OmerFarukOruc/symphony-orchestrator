let outletEl: HTMLElement | null = null;

export function initShell(root: HTMLElement): { sidebarEl: HTMLElement; headerEl: HTMLElement } {
  root.innerHTML = "";

  const skipLink = document.createElement("a");
  skipLink.href = "#main-content";
  skipLink.className = "skip-link";
  skipLink.textContent = "Skip to main content";

  const sidebarEl = document.createElement("aside");
  sidebarEl.className = "shell-sidebar";

  const contentEl = document.createElement("div");
  contentEl.className = "shell-content";

  const bannerEl = document.createElement("div");
  bannerEl.id = "stale-banner";
  bannerEl.hidden = true;
  bannerEl.setAttribute("role", "alert");
  bannerEl.setAttribute("aria-live", "polite");
  bannerEl.textContent = "State feed is stale — retrying every 5 seconds.";

  const headerEl = document.createElement("header");
  headerEl.className = "shell-header";

  outletEl = document.createElement("main");
  outletEl.className = "shell-outlet";
  outletEl.id = "main-content";
  outletEl.setAttribute("role", "main");
  outletEl.setAttribute("aria-label", "Main content");
  outletEl.setAttribute("tabindex", "-1");

  contentEl.append(bannerEl, headerEl, outletEl);
  root.append(skipLink, sidebarEl, contentEl);

  return { sidebarEl, headerEl };
}

export function getOutlet(): HTMLElement | null {
  return outletEl;
}
