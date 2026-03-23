import "./agentation-island";
import "./styles/tokens.css";
import "./styles/polish-tokens.css";
import "./styles/animations.css";
import "./styles/polish-motion.css";
import "./styles/primitives.css";
import "./styles/shell.css";
import "./styles/shell-responsive.css";
import "./styles/polish-brand.css";
import "./styles/palette.css";
import "./styles/components.css";
import "./styles/diff.css";
import "./styles/forms.css";
import "./styles/modal.css";
import "./styles/hardening.css";
import "./styles/kanban.css";
import "./styles/container-queries.css";
import "./styles/git.css";

import { api } from "./api";
import { lazyPage } from "./utils/lazy-page";
import { router } from "./router";
import { startPolling } from "./state/polling";
import { initCommandPalette } from "./ui/command-palette";
import { initHeader } from "./ui/header";
import { initKeyboard } from "./ui/keyboard";
import { getRouteAnnouncer, initShell } from "./ui/shell";
import { initSidebar } from "./ui/sidebar";
import { initTheme } from "./ui/theme";

let lastIssueContextId: string | null = null;

function setDocumentTitle(pageTitle: string): void {
  document.title = pageTitle === "Symphony" ? pageTitle : `${pageTitle} · Symphony`;
}

function announceRouteChange(pageTitle: string): void {
  const announcer = getRouteAnnouncer();
  if (!announcer) {
    return;
  }
  announcer.textContent = "";
  window.setTimeout(() => {
    announcer.textContent = pageTitle;
  }, 30);
}

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

app.classList.add("shell-app");

const { sidebarEl, headerEl } = initShell(app);
initSidebar(sidebarEl);
initHeader(headerEl);
initKeyboard(router, { resolveRunHistoryPath: currentIssueRunsPath });
initCommandPalette();
window.addEventListener("router:navigate", (event) => {
  const detail = (event as CustomEvent<{ path?: string; title?: string }>).detail;
  if (detail?.path) {
    rememberIssueContext(detail.path);
  }
  if (detail?.title) {
    setDocumentTitle(detail.title);
    announceRouteChange(detail.title);
  }
});

const overview = lazyPage(() => import("./pages/overview"));
const queue = lazyPage(() => import("./pages/queue"));
const issue = lazyPage(() => import("./pages/issue"));
const runs = lazyPage(() => import("./pages/runs"));
const logs = lazyPage(() => import("./pages/logs"));
const attempt = lazyPage(() => import("./pages/attempt"));

const config = lazyPage(() => import("./pages/config"));
const secrets = lazyPage(() => import("./pages/secrets"));
const observability = lazyPage(() => import("./pages/observability"));
const settings = lazyPage(() => import("./pages/settings"));
const notifications = lazyPage(() => import("./pages/notifications"));
const git = lazyPage(() => import("./pages/git"));
const workspaces = lazyPage(() => import("./pages/workspaces"));
const containers = lazyPage(() => import("./pages/containers"));
const welcome = lazyPage(() => import("./pages/welcome"));
const setup = lazyPage(() => import("./pages/setup"));

router.register("/", overview);
router.register("/queue", queue);
router.register("/queue/:id", queue);
router.register("/issues/:id", issue);
router.register("/issues/:id/runs", runs);
router.register("/issues/:id/logs", logs);
router.register("/logs/:id", logs);
router.register("/attempts/:id", attempt);

router.register("/config", config);
router.register("/secrets", secrets);
router.register("/observability", observability);
router.register("/settings", settings);
router.register("/notifications", notifications);
router.register("/git", git);
router.register("/workspaces", workspaces);
router.register("/containers", containers);
router.register("/welcome", welcome);
router.register("/setup", setup);

router.init();
startPolling();

// Block all navigation to non-/setup paths until setup is complete
let setupComplete = false;
router.setGuard((path) => {
  if (setupComplete || path === "/setup") return null;
  return "/setup";
});

api
  .getSetupStatus()
  .then((status) => {
    if (status.configured) {
      setupComplete = true;
      router.setGuard(() => null);
    }
  })
  .catch(() => {
    // Server may not have setup endpoint yet — allow navigation
    setupComplete = true;
    router.setGuard(() => null);
  });

// Listen for setup completion from the setup wizard
window.addEventListener("setup:complete", () => {
  setupComplete = true;
  router.setGuard(() => null);
});
