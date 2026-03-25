import { useEffect, useRef, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { api } from "../../../frontend/src/api";
import { router } from "../../../frontend/src/router";
import { startPolling } from "../../../frontend/src/state/polling";
import { initCommandPalette } from "../../../frontend/src/ui/command-palette";
import { initHeader } from "../../../frontend/src/ui/header";
import { initKeyboard } from "../../../frontend/src/ui/keyboard";
import { bindShellElements } from "../../../frontend/src/ui/shell";
import { initSidebar } from "../../../frontend/src/ui/sidebar";
import { initTheme } from "../../../frontend/src/ui/theme";
import { decoratePageRoot } from "../../../frontend/src/ui/page-motion";
import {
  buildRouteRenderKey,
  resolveSetupRoutingState,
  routeLoaders,
  type RouteLoader,
  type SetupRoutingState,
} from "./routing";

type QueryClientProp = {
  queryClient: QueryClient;
};

type LegacyRouteProps = Readonly<{
  outlet: HTMLElement | null;
  load: RouteLoader;
}>;

let commandPaletteReady = false;
let pollingStarted = false;

function setDocumentTitle(pageTitle: string): void {
  document.title = pageTitle === "Symphony" ? pageTitle : `${pageTitle} · Symphony`;
}

function announceRouteChange(announcer: HTMLElement | null, pageTitle: string): void {
  if (!announcer) {
    return;
  }
  announcer.textContent = "";
  window.setTimeout(() => {
    announcer.textContent = pageTitle;
  }, 30);
}

function routeTitle(rendered: HTMLElement): string {
  const titleElement = rendered.querySelector<HTMLElement>(".page-title, .issue-title, h1");
  return titleElement?.textContent?.trim() || document.title || "Symphony";
}

function currentIssueRunsPath(): string | null {
  const matchers = [/^\/issues\/([^/]+)(?:\/[^/]+)?$/, /^\/queue\/([^/]+)$/, /^\/logs\/([^/]+)$/];
  for (const matcher of matchers) {
    const match = window.location.pathname.match(matcher);
    if (match?.[1]) {
      return `/issues/${decodeURIComponent(match[1])}/runs`;
    }
  }
  return null;
}

function useSseInvalidation(queryClient: QueryClient): void {
  useEffect(() => {
    const source = new EventSource("/api/v1/events");
    source.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["setup-status"] });
      window.dispatchEvent(new CustomEvent("state:invalidate"));
    };
    source.onerror = () => {
      source.close();
    };
    return () => {
      source.close();
    };
  }, [queryClient]);
}

function createLoadingPlaceholder(message = "Loading…"): HTMLDivElement {
  const placeholder = document.createElement("div");
  placeholder.className = "page lazy-page lazy-page-skeleton";
  placeholder.textContent = message;
  return placeholder;
}

function LegacyRoute({ outlet, load }: LegacyRouteProps): null {
  const location = useLocation();
  const params = useParams();
  const routeRenderKey = buildRouteRenderKey(location.pathname, location.hash, params);

  useEffect(() => {
    if (!outlet) {
      return;
    }

    outlet.replaceChildren(createLoadingPlaceholder());

    let cancelled = false;
    const routeParams = params as Record<string, string>;

    load()
      .then((module) => {
        if (cancelled) {
          return;
        }
        const rendered = decoratePageRoot(module.render(routeParams));
        outlet.replaceChildren(rendered);
        const title = routeTitle(rendered);
        setDocumentTitle(title);
        const announcer = document.querySelector<HTMLElement>(".sr-only[role='status']");
        announceRouteChange(announcer, title);
        router.dispatchNavigation(location.pathname, routeParams, title);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const failure = document.createElement("div");
        failure.className = "page";
        const heading = document.createElement("h1");
        heading.className = "page-title";
        heading.textContent = "Route failed to load";
        const description = document.createElement("p");
        description.className = "page-subtitle";
        description.textContent = error instanceof Error ? error.message : "Unknown route error";
        failure.append(heading, description);
        outlet.replaceChildren(failure);
        setDocumentTitle("Route failed");
      });

    return () => {
      cancelled = true;
    };
  }, [load, location.pathname, outlet, routeRenderKey]);

  return null;
}

function PendingRoute({ outlet }: Readonly<{ outlet: HTMLElement | null }>): null {
  const location = useLocation();
  const params = useParams();
  const routeRenderKey = buildRouteRenderKey(location.pathname, location.hash, params);

  useEffect(() => {
    if (!outlet) {
      return;
    }

    outlet.replaceChildren(createLoadingPlaceholder("Loading workspace…"));
  }, [outlet, routeRenderKey]);

  return null;
}

function AppRoutes({
  outlet,
  setupState,
}: Readonly<{ outlet: HTMLElement | null; setupState: SetupRoutingState }>): JSX.Element {
  if (setupState === "pending") {
    return (
      <Routes>
        <Route path="*" element={<PendingRoute outlet={outlet} />} />
      </Routes>
    );
  }

  if (setupState === "setup-required") {
    return (
      <Routes>
        <Route path="/setup" element={<LegacyRoute outlet={outlet} load={routeLoaders.setup} />} />
        <Route path="*" element={<Navigate replace to="/setup" />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LegacyRoute outlet={outlet} load={routeLoaders.overview} />} />
      <Route path="/queue" element={<LegacyRoute outlet={outlet} load={routeLoaders.queue} />} />
      <Route path="/queue/:id" element={<LegacyRoute outlet={outlet} load={routeLoaders.queue} />} />
      <Route path="/issues/:id" element={<LegacyRoute outlet={outlet} load={routeLoaders.issue} />} />
      <Route path="/issues/:id/runs" element={<LegacyRoute outlet={outlet} load={routeLoaders.runs} />} />
      <Route path="/issues/:id/logs" element={<LegacyRoute outlet={outlet} load={routeLoaders.logs} />} />
      <Route path="/logs/:id" element={<LegacyRoute outlet={outlet} load={routeLoaders.logs} />} />
      <Route path="/attempts/:id" element={<LegacyRoute outlet={outlet} load={routeLoaders.attempt} />} />
      <Route path="/config" element={<Navigate replace to="/settings#advanced" />} />
      <Route path="/secrets" element={<Navigate replace to="/settings#credentials" />} />
      <Route path="/observability" element={<LegacyRoute outlet={outlet} load={routeLoaders.observability} />} />
      <Route path="/settings" element={<LegacyRoute outlet={outlet} load={routeLoaders.settings} />} />
      <Route path="/notifications" element={<LegacyRoute outlet={outlet} load={routeLoaders.notifications} />} />
      <Route path="/git" element={<LegacyRoute outlet={outlet} load={routeLoaders.git} />} />
      <Route path="/workspaces" element={<LegacyRoute outlet={outlet} load={routeLoaders.workspaces} />} />
      <Route path="/containers" element={<LegacyRoute outlet={outlet} load={routeLoaders.containers} />} />
      <Route path="/welcome" element={<LegacyRoute outlet={outlet} load={routeLoaders.welcome} />} />
      <Route path="/setup" element={<LegacyRoute outlet={outlet} load={routeLoaders.setup} />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

export function App({ queryClient }: Readonly<QueryClientProp>): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const outletRef = useRef<HTMLElement | null>(null);
  const announcerRef = useRef<HTMLElement | null>(null);
  const [outlet, setOutlet] = useState<HTMLElement | null>(null);

  const { data, isError } = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => api.getSetupStatus(),
    retry: false,
  });

  const setupState = resolveSetupRoutingState(data, isError);

  useSseInvalidation(queryClient);

  useEffect(() => {
    initTheme();
  }, []);

  useEffect(() => {
    bindShellElements(outletRef.current, announcerRef.current);
    setOutlet(outletRef.current);
    if (sidebarRef.current) {
      initSidebar(sidebarRef.current);
    }
    if (headerRef.current) {
      initHeader(headerRef.current);
    }
    if (!commandPaletteReady) {
      initCommandPalette();
      commandPaletteReady = true;
    }
    initKeyboard(router, { resolveRunHistoryPath: currentIssueRunsPath });
    router.setExternalNavigator((path) => navigate(path));
    if (!pollingStarted) {
      startPolling();
      pollingStarted = true;
    }
    return () => {
      router.setExternalNavigator(null);
    };
  }, [navigate]);

  useEffect(() => {
    if (location.pathname === "/setup") {
      router.dispatchNavigation("/setup", {}, "Setup");
    }
  }, [location.pathname]);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <aside ref={sidebarRef} className="shell-sidebar" role="navigation" aria-label="Primary navigation" />
      <div className="shell-content">
        <div id="stale-banner" hidden role="alert" aria-live="polite">
          State feed is stale — retrying every 5 seconds.
        </div>
        <header ref={headerRef} className="shell-header" />
        <div ref={announcerRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
        <main
          ref={outletRef}
          className="shell-outlet"
          id="main-content"
          role="main"
          aria-label="Main content"
          tabIndex={-1}
        />
      </div>
      <AppRoutes outlet={outlet} setupState={setupState} />
    </>
  );
}
