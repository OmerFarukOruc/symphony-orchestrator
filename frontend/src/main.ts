import "./styles/tokens.css";
import "./styles/animations.css";
import "./styles/primitives.css";
import "./styles/shell.css";
import "./styles/palette.css";
import "./styles/components.css";
import "./styles/diff.css";
import "./styles/forms.css";
import "./styles/modal.css";
import "./styles/hardening.css";

import { lazyPage } from "./utils/lazy-page";
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

const overview = lazyPage(() => import("./pages/overview"));
const queue = lazyPage(() => import("./pages/queue"));
const issue = lazyPage(() => import("./pages/issue"));
const runs = lazyPage(() => import("./pages/runs"));
const logs = lazyPage(() => import("./pages/logs"));
const attempt = lazyPage(() => import("./pages/attempt"));
const planner = lazyPage(() => import("./pages/planner"));
const config = lazyPage(() => import("./pages/config"));
const secrets = lazyPage(() => import("./pages/secrets"));
const observability = lazyPage(() => import("./pages/observability"));
const settings = lazyPage(() => import("./pages/settings"));
const notifications = lazyPage(() => import("./pages/notifications"));
const git = lazyPage(() => import("./pages/git"));
const workspaces = lazyPage(() => import("./pages/workspaces"));
const containers = lazyPage(() => import("./pages/containers"));
const welcome = lazyPage(() => import("./pages/welcome"));

router.register("/", overview);
router.register("/queue", queue);
router.register("/queue/:id", queue);
router.register("/issues/:id", issue);
router.register("/issues/:id/runs", runs);
router.register("/issues/:id/logs", logs);
router.register("/logs/:id", logs);
router.register("/attempts/:id", attempt);
router.register("/planner", planner);
router.register("/config", config);
router.register("/secrets", secrets);
router.register("/observability", observability);
router.register("/settings", settings);
router.register("/notifications", notifications);
router.register("/git", git);
router.register("/workspaces", workspaces);
router.register("/containers", containers);
router.register("/welcome", welcome);

router.init();
startPolling();
