import "../styles/templates.css";
import { createTemplatesPage } from "../views/templates-view";

export function render(): HTMLElement {
  return createTemplatesPage();
}
