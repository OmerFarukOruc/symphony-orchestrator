import "../styles/observability.css";

import { createObservabilityPage } from "../views/observability-view";

export function render(): HTMLElement {
  return createObservabilityPage();
}
