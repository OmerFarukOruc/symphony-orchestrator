import "./styles/tokens.css";
import "./styles/animations.css";
import "./styles/primitives.css";
import "./styles/shell.css";
import "./styles/palette.css";
import "./styles/components.css";
import "./styles/diff.css";
import "./styles/forms.css";
import "./styles/modal.css";

import * as attempt from "./pages/attempt";
import * as config from "./pages/config";
import * as issue from "./pages/issue";
import * as logs from "./pages/logs";
import * as observability from "./pages/observability";
import * as overview from "./pages/overview";
import * as planner from "./pages/planner";
import * as queue from "./pages/queue";
import * as runs from "./pages/runs";
import * as secrets from "./pages/secrets";
import * as settings from "./pages/settings";
import { router } from "./router";
import { startPolling } from "./state/polling";
import { initCommandPalette } from "./ui/command-palette";
import { initHeader } from "./ui/header";
import { initKeyboard } from "./ui/keyboard";
import { initShell } from "./ui/shell";
import { initSidebar } from "./ui/sidebar";
import { initTheme } from "./ui/theme";

let lastIssueContextId: string | null = null;

function rememberIssueContext(path: string): void {
  const matchers = [/^\/issues\/([^/]+)(?:\/[^/]+)?$/, /^\/queue\/([^/]+)$/, /^\/logs\/([^/]+)$/];
  for (const matcher of matchers) {
    const match = path.match(matcher);
    if (match?.[1]) {
      lastIssueContextId = decodeURIComponent(match[1]);
      return;
    }
  }
}

function currentIssueRunsPath(): string | null {
  rememberIssueContext(window.location.pathname);
  return lastIssueContextId ? `/issues/${lastIssueContextId}/runs` : null;
}

initTheme();

const app = document.getElementById("app");
if (!app) {
  throw new Error("#app root not found");
}

const { sidebarEl, headerEl } = initShell(app);
initSidebar(sidebarEl);
initHeader(headerEl);
initKeyboard(router, { resolveRunHistoryPath: currentIssueRunsPath });
initCommandPalette();
window.addEventListener("router:navigate", (event) => {
  const detail = (event as CustomEvent<{ path?: string }>).detail;
  if (detail?.path) {
    rememberIssueContext(detail.path);
  }
});

router.register("/", () => overview.render());
router.register("/queue", () => queue.render());
router.register("/queue/:id", (params) => queue.render(params));
router.register("/issues/:id", (params) => issue.render(params));
router.register("/issues/:id/runs", (params) => runs.render(params));
router.register("/issues/:id/logs", (params) => logs.render(params));
router.register("/logs/:id", (params) => logs.render(params));
router.register("/attempts/:id", (params) => attempt.render(params));
router.register("/planner", () => planner.render());
router.register("/config", () => config.render());
router.register("/secrets", () => secrets.render());
router.register("/observability", () => observability.render());
router.register("/settings", () => settings.render());
router.register("/runs-placeholder", () => runs.render());

router.init();
startPolling();
