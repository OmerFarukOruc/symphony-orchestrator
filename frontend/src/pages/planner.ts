import "../styles/planner.css";

import { createPlannerPage } from "../views/planner-view";

export function render(): HTMLElement {
  return createPlannerPage();
}
