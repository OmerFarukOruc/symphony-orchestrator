import "../styles/containers.css";

import { buildContainersPage } from "./containers-view";

export function render(): HTMLElement {
  return buildContainersPage();
}
