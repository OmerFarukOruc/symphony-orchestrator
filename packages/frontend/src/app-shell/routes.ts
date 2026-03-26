export type NavGroup = "Operate" | "Configure" | "Observe" | "System";

export type ShellRoute = Readonly<{
  key: string;
  href: string;
  routePath?: string;
  title: string;
  description: string;
  aliasTo?: string;
  nav?: Readonly<{
    group: NavGroup;
    label: string;
    hotkey: string;
  }>;
}>;

export const navGroups: readonly NavGroup[] = ["Operate", "Configure", "Observe", "System"];

export const shellRoutes: readonly ShellRoute[] = [
  {
    key: "overview",
    href: "/",
    title: "Overview",
    description: "Placeholder root route for the future React overview dashboard.",
    nav: { group: "Operate", label: "Overview", hotkey: "g o" },
  },
  {
    key: "queue",
    href: "/queue",
    routePath: "queue",
    title: "Board",
    description: "Placeholder board route that preserves the queue list URL in the React shell.",
    nav: { group: "Operate", label: "Board", hotkey: "g q" },
  },
  {
    key: "queue-detail",
    href: "/queue/:id",
    routePath: "queue/:id",
    title: "Board issue detail",
    description: "Placeholder detail route for a queue-selected issue.",
  },
  {
    key: "issue-detail",
    href: "/issues/:issue_identifier",
    routePath: "issues/:issue_identifier",
    title: "Issue detail",
    description: "Placeholder issue route for the dedicated issue detail screen.",
  },
  {
    key: "issue-runs",
    href: "/issues/:id/runs",
    routePath: "issues/:id/runs",
    title: "Issue runs",
    description: "Placeholder issue run history route.",
  },
  {
    key: "issue-logs",
    href: "/issues/:id/logs",
    routePath: "issues/:id/logs",
    title: "Issue logs",
    description: "Placeholder issue log route.",
  },
  {
    key: "logs",
    href: "/logs/:id",
    routePath: "logs/:id",
    title: "Log stream",
    description: "Placeholder log stream route for run-focused diagnostics.",
  },
  {
    key: "attempts",
    href: "/attempts/:id",
    routePath: "attempts/:id",
    title: "Attempt detail",
    description: "Placeholder attempt route for archived attempt playback.",
  },
  {
    key: "observability",
    href: "/observability",
    routePath: "observability",
    title: "Observability",
    description: "Placeholder observability route for metrics, traces, and runtime health.",
    nav: { group: "Observe", label: "Observability", hotkey: "g m" },
  },
  {
    key: "git",
    href: "/git",
    routePath: "git",
    title: "Git",
    description: "Placeholder Git route for repo and branch state.",
    nav: { group: "Observe", label: "Git", hotkey: "g g" },
  },
  {
    key: "workspaces",
    href: "/workspaces",
    routePath: "workspaces",
    title: "Workspaces",
    description: "Placeholder route for workspace inventory and cleanup actions.",
    nav: { group: "Observe", label: "Workspaces", hotkey: "g w" },
  },
  {
    key: "containers",
    href: "/containers",
    routePath: "containers",
    title: "Containers",
    description: "Placeholder container inventory route.",
    nav: { group: "Observe", label: "Containers", hotkey: "g d" },
  },
  {
    key: "notifications",
    href: "/notifications",
    routePath: "notifications",
    title: "Notifications",
    description: "Placeholder notifications route for Slack and future delivery channels.",
    nav: { group: "Observe", label: "Notifications", hotkey: "g n" },
  },
  {
    key: "welcome",
    href: "/welcome",
    routePath: "welcome",
    title: "Welcome",
    description: "Placeholder onboarding route that preserves the current welcome URL.",
    nav: { group: "System", label: "Welcome", hotkey: "g i" },
  },
  {
    key: "config-alias",
    href: "/config",
    routePath: "config",
    title: "Advanced settings alias",
    description: "Compatibility alias that forwards the legacy config route to the settings shell.",
    aliasTo: "/settings#advanced",
  },
  {
    key: "secrets",
    href: "/secrets",
    routePath: "secrets",
    title: "Credentials",
    description: "Securely store provider keys and tokens used by Symphony operators.",
    nav: { group: "Configure", label: "Credentials", hotkey: "g s" },
  },
  {
    key: "settings",
    href: "/settings",
    routePath: "settings",
    title: "Settings",
    description: "Placeholder settings route shared by the advanced and credentials aliases.",
    nav: { group: "Configure", label: "Settings", hotkey: "g ," },
  },
  {
    key: "setup",
    href: "/setup",
    routePath: "setup",
    title: "Setup",
    description: "Placeholder setup wizard route used while configuration is incomplete.",
    nav: { group: "System", label: "Setup", hotkey: "g u" },
  },
] as const;

export function routesForGroup(group: NavGroup): ShellRoute[] {
  return shellRoutes.filter((route) => route.nav?.group === group);
}
