import { useEffect, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { matchPath, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppLayout } from "./app-shell/AppLayout";
import { shellRoutes, type ShellRoute } from "./app-shell/routes";
import { resolveSetupRoutingState, setupStatusQueryOptions } from "./hooks/query-client";
import { AttemptRoute } from "./routes/Attempt";
import { ContainersRoute } from "./routes/Containers";
import { GitRoute } from "./routes/Git";
import { IssueDetailRoute } from "./routes/IssueDetail";
import { IssueRunsRoute } from "./routes/IssueRuns";
import { LogsRoute } from "./routes/Logs";
import { NotificationsRoute } from "./routes/Notifications";
import { ObservabilityRoute } from "./routes/Observability";
import { Overview } from "./routes/Overview";
import { QueueRoute } from "./routes/Queue";
import { SecretsRoute } from "./routes/Secrets";
import { Settings } from "./routes/Settings";
import { SetupRoute } from "./routes/Setup";
import { WelcomeRoute } from "./routes/Welcome";
import { WorkspacesRoute } from "./routes/Workspaces";

const routeElements: Readonly<Record<string, ReactElement>> = {
  overview: <Overview />,
  queue: <QueueRoute />,
  "queue-detail": <QueueRoute />,
  "issue-detail": <IssueDetailRoute />,
  "issue-runs": <IssueRunsRoute />,
  "issue-logs": <LogsRoute />,
  logs: <LogsRoute />,
  attempts: <AttemptRoute />,
  observability: <ObservabilityRoute />,
  git: <GitRoute />,
  workspaces: <WorkspacesRoute />,
  containers: <ContainersRoute />,
  notifications: <NotificationsRoute />,
  welcome: <WelcomeRoute />,
  secrets: <SecretsRoute />,
  settings: <Settings />,
  setup: <SetupRoute />,
};

function matchRoute(pathname: string): ShellRoute | null {
  for (const route of shellRoutes) {
    if (route.routePath === undefined) {
      if (pathname === route.href) {
        return route;
      }
      continue;
    }

    const matched = matchPath({ path: `/${route.routePath}`, end: true }, pathname);
    if (matched) {
      return route;
    }
  }

  return null;
}

function buildRouteElement(route: ShellRoute): ReactElement {
  const element = route.aliasTo ? <Navigate replace to={route.aliasTo} /> : (routeElements[route.key] ?? <Overview />);

  if (route.routePath === undefined) {
    return <Route key={route.key} index element={element} />;
  }

  return <Route key={route.key} path={route.routePath} element={element} />;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function App(): ReactElement {
  const location = useLocation();
  const { data, isError } = useQuery(setupStatusQueryOptions);

  const setupState = resolveSetupRoutingState(data, isError);

  useEffect(() => {
    const activeRoute = matchRoute(location.pathname);
    const title = (activeRoute?.title ?? document.title) || "Symphony";
    document.title = title === "Overview" ? "Symphony" : `${title} · Symphony`;
  }, [location.pathname]);

  if (setupState === "setup-required" && location.pathname !== "/setup") {
    return <Navigate replace to="/setup" />;
  }

  return (
    <Routes>
      <Route element={<AppLayout setupState={setupState} />}>
        {shellRoutes.map((route) => buildRouteElement(route))}
      </Route>
    </Routes>
  );
}
