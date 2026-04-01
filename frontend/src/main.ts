import "./agentation-island";
import "./styles/tokens.css";
import "./styles/polish-tokens.css";
import "./styles/animations.css";
import "./styles/polish-motion.css";
import "./styles/primitives.css";
import "./styles/shell.css";
import "./styles/shell-responsive.css";
import "./styles/polish-brand.css";
import "./styles/polish-delight.css";
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
import { initDelightClicks } from "./ui/delight.js";
import { lazyPage } from "./utils/lazy-page";
import { router } from "./router";
import { connectEventSource } from "./state/event-source";
import { startPolling } from "./state/polling";
import { initCommandPalette } from "./ui/command-palette";
import { initHeader } from "./ui/header";
import { initKeyboard } from "./ui/keyboard";
import { getRouteAnnouncer, initShell } from "./ui/shell";
import { initSidebar } from "./ui/sidebar";
import { initTheme } from "./ui/theme";
import { deduplicatedToast } from "./utils/toast-events.js";

let lastIssueContextId: string | null = null;

function setDocumentTitle(pageTitle: string): void {
  document.title = pageTitle === "Risoluto" ? pageTitle : `${pageTitle} · Risoluto`;
}

function announceRouteChange(pageTitle: string): void {
  const announcer = getRouteAnnouncer();
  if (!announcer) {
    return;
  }
  announcer.textContent = "";
  globalThis.setTimeout(() => {
    announcer.textContent = pageTitle;
  }, 30);
}

function rememberIssueContext(path: string): void {
  const matchers = [/^\/issues\/([^/]+)(?:\/[^/]+)?$/, /^\/queue\/([^/]+)$/, /^\/logs\/([^/]+)$/];
  for (const matcher of matchers) {
    const match = matcher.exec(path);
    if (match?.[1]) {
      lastIssueContextId = decodeURIComponent(match[1]);
      return;
    }
  }
}

function currentIssueRunsPath(): string | null {
  rememberIssueContext(globalThis.location.pathname);
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
initDelightClicks();
globalThis.addEventListener("router:navigate", (event) => {
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

const observability = lazyPage(() => import("./pages/observability"));
const settings = lazyPage(() => import("./pages/settings"));
const notifications = lazyPage(() => import("./pages/notifications"));
const git = lazyPage(() => import("./pages/git"));
const workspaces = lazyPage(() => import("./pages/workspaces"));
const containers = lazyPage(() => import("./pages/containers"));

const templates = lazyPage(() => import("./pages/templates"));
const audit = lazyPage(() => import("./pages/audit"));

const setup = lazyPage(() => import("./pages/setup"));

function aliasSettingsRoute(
  target: string,
  render: ReturnType<typeof lazyPage>,
): (params?: Record<string, string>) => HTMLElement {
  return (params) => {
    const current = `${globalThis.location.pathname}${globalThis.location.hash}`;
    if (current !== target) {
      globalThis.history.replaceState({}, "", target);
    }
    return render(params);
  };
}

router.register("/", overview);
router.register("/queue", queue);
router.register("/queue/:id", queue);
router.register("/issues/:id", issue);
router.register("/issues/:id/runs", runs);
router.register("/issues/:id/logs", logs);
router.register("/logs/:id", logs);
router.register("/attempts/:id", attempt);

router.register("/config", aliasSettingsRoute("/settings#devtools", settings));
router.register("/secrets", aliasSettingsRoute("/settings#credentials", settings));
router.register("/observability", observability);
router.register("/settings", settings);
router.register("/notifications", notifications);
router.register("/git", git);
router.register("/workspaces", workspaces);
router.register("/containers", containers);
router.register("/templates", templates);
router.register("/audit", audit);
router.register("/welcome", () => {
  router.navigate("/settings");
  return document.createElement("div");
});
router.register("/setup", setup);

// Check setup status BEFORE first render to avoid flash of overview
let setupComplete = false;

router.setGuard((path) => {
  if (setupComplete || path === "/setup") return null;
  return "/setup";
});

try {
  const status = await api.getSetupStatus();
  if (status.configured) {
    setupComplete = true;
    router.setGuard(() => null);
  }
  router.init();
  startPolling();
  connectEventSource();
} catch {
  // Server may not have setup endpoint yet — allow navigation
  setupComplete = true;
  router.setGuard(() => null);
  router.init();
  startPolling();
  connectEventSource();
}

// Listen for setup completion from the setup wizard
globalThis.addEventListener("setup:complete", () => {
  setupComplete = true;
  router.setGuard(() => null);
});

// ── SSE system event toast notifications ──────────────────────────────

globalThis.addEventListener("risoluto:worker-failed", (event) => {
  const detail = (event as CustomEvent<{ error?: string; identifier?: string }>).detail;
  const message = detail?.error ?? "A worker process failed";
  deduplicatedToast(`Worker failed: ${message}`, "error");
});

globalThis.addEventListener("risoluto:system-error", (event) => {
  const detail = (event as CustomEvent<{ message?: string }>).detail;
  const message = detail?.message ?? "An unexpected system error occurred";
  deduplicatedToast(`System error: ${message}`, "error");
});

globalThis.addEventListener("risoluto:model-updated", (event) => {
  const detail = (event as CustomEvent<{ identifier?: string; model?: string }>).detail;
  const identifier = detail?.identifier ?? "unknown";
  deduplicatedToast(`Model updated for ${identifier}`, "info");
});
