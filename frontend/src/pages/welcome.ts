import "../styles/welcome.css";

import { buildWelcomePage } from "./welcome-view";

export function render(): HTMLElement {
  return buildWelcomePage();
}
