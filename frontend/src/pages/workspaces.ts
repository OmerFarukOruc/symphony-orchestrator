import "../styles/workspaces.css";

import { buildWorkspacesPage } from "./workspaces-view";

export function render(): HTMLElement {
  return buildWorkspacesPage();
}
