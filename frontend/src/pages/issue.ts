import "../styles/issue.css";
import "../styles/issue-inspector-rail.css";

import { createIssuePage } from "./issue-view";

export function render(params?: Record<string, string>): HTMLElement {
  return createIssuePage(params?.id ?? "");
}
