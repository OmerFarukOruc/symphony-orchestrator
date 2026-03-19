import "../styles/overview.css";

import { createOverviewPage } from "./overview-view";

export function render(): HTMLElement {
  return createOverviewPage();
}
