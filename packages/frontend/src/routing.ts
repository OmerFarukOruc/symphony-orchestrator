type SetupStatusResponse = {
  configured: boolean;
};

export type SetupRoutingState = "pending" | "configured" | "setup-required";

export type RouteLoader = () => Promise<{
  render: (params?: Record<string, string>) => HTMLElement;
}>;

export function resolveSetupRoutingState(data: SetupStatusResponse | undefined, isError: boolean): SetupRoutingState {
  if (isError) {
    return "configured";
  }
  if (data === undefined) {
    return "pending";
  }
  return data.configured ? "configured" : "setup-required";
}

export function buildRouteRenderKey(
  pathname: string,
  hash: string,
  params: Readonly<Record<string, string | undefined>>,
): string {
  const serializedParams = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value ?? ""}`)
    .join("&");
  return `${pathname}${hash}?${serializedParams}`;
}

export const routeLoaders = {
  attempt: () => import("../../../frontend/src/pages/attempt"),
  containers: () => import("../../../frontend/src/pages/containers"),
  git: () => import("../../../frontend/src/pages/git"),
  issue: () => import("../../../frontend/src/pages/issue"),
  logs: () => import("../../../frontend/src/pages/logs"),
  notifications: () => import("../../../frontend/src/pages/notifications"),
  observability: () => import("../../../frontend/src/pages/observability"),
  overview: () => import("../../../frontend/src/pages/overview"),
  queue: () => import("../../../frontend/src/pages/queue"),
  runs: () => import("../../../frontend/src/pages/runs"),
  settings: () => import("../../../frontend/src/pages/settings"),
  setup: () => import("../../../frontend/src/pages/setup"),
  welcome: () => import("../../../frontend/src/pages/welcome"),
  workspaces: () => import("../../../frontend/src/pages/workspaces"),
} satisfies Record<string, RouteLoader>;
