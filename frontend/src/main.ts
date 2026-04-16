import "./agentation-island.js";
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

import { api } from "./api.js";
import { initDelightClicks } from "./ui/delight.js";
import { lazyPage } from "./utils/lazy-page.js";
import { router } from "./router.js";
import { getRuntimeClient } from "./state/runtime-client.js";
import { initCommandPalette } from "./ui/command-palette.js";
import { initHeader } from "./ui/header.js";
import { initKeyboard } from "./ui/keyboard.js";
import { getRouteAnnouncer, initShell } from "./ui/shell.js";
import { initSidebar } from "./ui/sidebar.js";
import { initTheme } from "./ui/theme.js";
import { deduplicatedToast } from "./utils/toast-events.js";

let lastIssueContextId: string | null = null;
const runtimeClient = getRuntimeClient();

function setDocumentTitle(pageTitle: string): void {
  const base = pageTitle.replaceAll(" · Risoluto", "").trim();
  document.title = base === "Risoluto" || base === "" ? "Risoluto" : `${base} · Risoluto`;
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

const overview = lazyPage(() => import("./pages/overview.js"));
const queue = lazyPage(() => import("./pages/queue.js"));
const issue = lazyPage(() => import("./pages/issue.js"));
const runs = lazyPage(() => import("./pages/runs.js"));
const logs = lazyPage(() => import("./pages/logs.js"));
const attempt = lazyPage(() => import("./pages/attempt.js"));

const observability = lazyPage(() => import("./pages/observability.js"));
const settings = lazyPage(() => import("./pages/settings.js"));
const notifications = lazyPage(() => import("./pages/notifications.js"));
const git = lazyPage(() => import("./pages/git.js"));
const workspaces = lazyPage(() => import("./pages/workspaces.js"));
const containers = lazyPage(() => import("./pages/containers.js"));

const templates = lazyPage(() => import("./pages/templates.js"));
const audit = lazyPage(() => import("./pages/audit.js"));

const setup = lazyPage(() => import("./pages/setup.js"));

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

router.register("/", overview, "Overview");
router.register("/queue", queue, "Board");
router.register("/queue/:id", queue, "Board");
router.register("/issues/:id", issue);
router.register("/issues/:id/runs", runs);
router.register("/issues/:id/logs", logs);
router.register("/logs/:id", logs);
router.register("/attempts/:id", attempt);

router.register("/config", aliasSettingsRoute("/settings#devtools", settings), "Settings");
router.register("/secrets", aliasSettingsRoute("/settings#credentials", settings), "Settings");
router.register("/observability", observability, "Observability");
router.register("/settings", settings, "Settings");
router.register("/notifications", notifications, "Notifications");
router.register("/git", git, "Git");
router.register("/workspaces", workspaces, "Workspaces");
router.register("/containers", containers, "Containers");
router.register("/templates", templates, "Templates");
router.register("/audit", audit, "Audit Log");
router.register("/welcome", () => {
  router.navigate("/settings");
  return document.createElement("div");
});
router.register("/setup", setup, "Setup");

router.setNotFound(() => {
  const page = document.createElement("div");
  page.className = "page-not-found";
  const h1 = document.createElement("h1");
  h1.className = "page-title";
  h1.textContent = "Page not found";
  const p = document.createElement("p");
  p.className = "text-secondary";
  p.textContent = "The page you're looking for doesn't exist.";
  const back = document.createElement("a");
  back.href = "/";
  back.className = "mc-link";
  back.textContent = "← Back to overview";
  back.addEventListener("click", (e) => {
    e.preventDefault();
    router.navigate("/");
  });
  page.append(h1, p, back);
  return page;
});

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
  runtimeClient.start();
} catch {
  // Server may not have setup endpoint yet — allow navigation
  setupComplete = true;
  router.setGuard(() => null);
  router.init();
  runtimeClient.start();
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
