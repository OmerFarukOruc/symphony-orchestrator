import { router } from "../router";
import { navGroups, navItems } from "./nav-items";

function iconMarkup(svg: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "sidebar-icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = svg;
  return span;
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
    const groupLabel = document.createElement("span");
    groupLabel.className = "sidebar-group-label";
    groupLabel.textContent = groupName;
    const groupToggle = document.createElement("span");
    groupToggle.className = "sidebar-group-toggle";
    groupToggle.textContent = "⌃";
    header.append(groupLabel, groupToggle);

    const groupItems = navItems.filter((item) => item.group === groupName);
    for (const item of groupItems) {
      const button = document.createElement("button");
      button.className = "sidebar-item transition-base";
      button.type = "button";
      button.dataset.path = item.path;
      button.title = item.name;
      const labelSpan = document.createElement("span");
      labelSpan.className = "sidebar-item-label";
      labelSpan.textContent = item.name;
      const tooltipSpan = document.createElement("span");
      tooltipSpan.className = "sidebar-item-tooltip";
      tooltipSpan.textContent = item.name;
      button.append(iconMarkup(item.icon), labelSpan, tooltipSpan);
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
