import "../styles/attempt.css";

import { createAttemptPage } from "../views/attempt-view";

export function render(params?: Record<string, string>): HTMLElement {
  return createAttemptPage(params?.id ?? "");
}
