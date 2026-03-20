import "../styles/setup.css";
import { createSetupPage } from "../views/setup-view";

export function render(): HTMLElement {
  return createSetupPage();
}
