import "../styles/settings.css";

import { createSettingsPage } from "../views/settings-view";

export function render(): HTMLElement {
  return createSettingsPage();
}
