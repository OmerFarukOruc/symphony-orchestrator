import { api } from "../api";
import { router } from "../router.js";
import type { LinearProject } from "../types/setup.js";
import { createEmptyState } from "./empty-state.js";

interface ProjectPickerOptions {
  /** Called when a project is selected — receives the slugId. */
  onSelect: (slugId: string) => void;
}

/**
 * Opens a centered modal that fetches and displays Linear projects,
 * letting the user pick one. Closes on selection or backdrop click.
 */
export function openProjectPicker(options: ProjectPickerOptions): void {
  // Remove any existing picker first
  document.querySelector(".project-picker-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "project-picker-overlay";

  const popover = document.createElement("div");
  popover.className = "project-picker-popover";

  const title = document.createElement("div");
  title.className = "project-picker-title";
  title.textContent = "Select Linear project";

  const list = document.createElement("div");
  list.className = "project-picker-list";
  list.textContent = "Loading projects…";

  popover.append(title, list);
  overlay.append(popover);
  document.body.append(overlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  function close(): void {
    overlay.remove();
  }

  function renderProjects(projects: LinearProject[]): void {
    list.replaceChildren();
    if (projects.length === 0) {
      list.append(
        createEmptyState(
          "No projects found",
          "No Linear projects were returned for the current API key. Double-check the key permissions, or create a project in Linear first.",
          "Open setup",
          () => {
            close();
            router.navigate("/setup");
          },
        ),
      );
      return;
    }
    for (const project of projects) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "project-picker-card";
      const name = document.createElement("strong");
      name.textContent = project.name;
      const slug = document.createElement("span");
      slug.className = "project-picker-slug";
      slug.textContent = project.slugId;
      card.append(name, slug);
      card.addEventListener("click", () => {
        options.onSelect(project.slugId);
        close();
      });
      list.append(card);
    }
  }

  api.getLinearProjects().then(
    (result) => renderProjects(result.projects),
    (error: unknown) => {
      list.textContent = error instanceof Error ? error.message : "Failed to load projects.";
    },
  );
}
