import { router } from "../router";
import { navGroups, navItems } from "./nav-items";

function iconMarkup(svg: string): string {
  return `<span class="sidebar-icon" aria-hidden="true">${svg}</span>`;
}

function updateActiveState(sidebarEl: HTMLElement): void {
  const current = window.location.pathname;
  for (const item of sidebarEl.querySelectorAll<HTMLElement>(".sidebar-item")) {
    const path = item.dataset.path ?? "";
    const active = current === path || (path !== "/" && current.startsWith(`${path}/`));
    item.classList.toggle("is-active", active);
  }
}

export function initSidebar(sidebarEl: HTMLElement): void {
  sidebarEl.classList.add("transition-base");
  sidebarEl.innerHTML = "";

  for (const groupName of navGroups) {
    const group = document.createElement("section");
    group.className = "sidebar-group";

    const header = document.createElement("div");
    header.className = "sidebar-group-header";
    header.innerHTML = `<span class="sidebar-group-label">${groupName}</span><span class="sidebar-group-toggle">⌃</span>`;

    const groupItems = navItems.filter((item) => item.group === groupName);
    for (const item of groupItems) {
      const button = document.createElement("button");
      button.className = "sidebar-item transition-base";
      button.type = "button";
      button.dataset.path = item.path;
      button.title = item.name;
      button.innerHTML = `${iconMarkup(item.icon)}<span class="sidebar-item-label">${item.name}</span><span class="sidebar-item-tooltip">${item.name}</span>`;
      button.addEventListener("click", () => router.navigate(item.path));
      group.append(button);
    }

    group.prepend(header);
    sidebarEl.append(group);
  }

  sidebarEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest(".sidebar-group-header")) {
      sidebarEl.classList.toggle("is-expanded");
    }
  });

  updateActiveState(sidebarEl);
  window.addEventListener("router:navigate", () => updateActiveState(sidebarEl));
}
