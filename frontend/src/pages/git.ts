import "../styles/git.css";

import { buildGitPage } from "./git-view";

export function render(): HTMLElement {
  return buildGitPage();
}
