import "../styles/runs.css";

import { createRunsPage } from "../views/runs-view";

export function render(params?: Record<string, string>): HTMLElement {
  return createRunsPage(params?.id ?? "");
}
