import "../styles/secrets.css";

import { createSecretsPage } from "../views/secrets-view";

export function render(): HTMLElement {
  return createSecretsPage();
}
