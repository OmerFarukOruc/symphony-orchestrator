import { createIssueInspector } from "../components/issue-inspector";
import { registerPageCleanup } from "../utils/page";

export function createIssuePage(id: string): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";
  const inspector = createIssueInspector({ mode: "page", initialId: id });
  page.append(inspector.element);
  registerPageCleanup(page, () => inspector.destroy());
  return page;
}
