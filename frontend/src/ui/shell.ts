let outletEl: HTMLElement | null = null;

export function initShell(root: HTMLElement): { sidebarEl: HTMLElement; headerEl: HTMLElement } {
  root.innerHTML = "";

  const sidebarEl = document.createElement("aside");
  sidebarEl.className = "shell-sidebar";

  const contentEl = document.createElement("div");
  contentEl.className = "shell-content";

  const bannerEl = document.createElement("div");
  bannerEl.id = "stale-banner";
  bannerEl.hidden = true;
  bannerEl.textContent = "State feed is stale — retrying every 5 seconds.";

  const headerEl = document.createElement("header");
  headerEl.className = "shell-header";

  outletEl = document.createElement("main");
  outletEl.className = "shell-outlet";

  contentEl.append(bannerEl, headerEl, outletEl);
  root.append(sidebarEl, contentEl);

  return { sidebarEl, headerEl };
}

export function getOutlet(): HTMLElement | null {
  return outletEl;
}
