import "../styles/welcome.css";
import { createWelcomePage } from "../views/welcome-view";

export function render(): HTMLElement {
  return createWelcomePage();
}
