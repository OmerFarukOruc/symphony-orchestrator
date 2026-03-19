import "../styles/logs.css";

import { createLogsPage } from "./logs-view";

export function render(params?: Record<string, string>): HTMLElement {
  return createLogsPage(params?.id ?? "");
}
