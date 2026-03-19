export interface NavItem {
  group: string;
  name: string;
  path: string;
  hotkey: string;
  icon: string;
}

export const navItems: NavItem[] = [
  {
    group: "Operate",
    name: "Overview",
    path: "/",
    hotkey: "g o",
    icon: "<svg viewBox='0 0 24 24'><path d='M4 11.5 12 5l8 6.5v7.5h-5v-5H9v5H4z'/></svg>",
  },
  {
    group: "Operate",
    name: "Queue",
    path: "/queue",
    hotkey: "g q",
    icon: "<svg viewBox='0 0 24 24'><path d='M4 6h16v3H4zm0 5h16v3H4zm0 5h16v3H4z'/></svg>",
  },
  {
    group: "Operate",
    name: "Runs",
    path: "/runs-placeholder",
    hotkey: "g r",
    icon: "<svg viewBox='0 0 24 24'><path d='M5 5h14v4H5zm0 5h14v4H5zm0 5h14v4H5z'/></svg>",
  },
  {
    group: "Configure",
    name: "Planner",
    path: "/planner",
    hotkey: "g p",
    icon: "<svg viewBox='0 0 24 24'><path d='m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'/></svg>",
  },
  {
    group: "Configure",
    name: "Config",
    path: "/config",
    hotkey: "g c",
    icon: "<svg viewBox='0 0 24 24'><path d='M6 4h3v6H6zm9 0h3v10h-3zM6 14h3v6H6zm9 0h3v6h-3z'/></svg>",
  },
  {
    group: "Configure",
    name: "Secrets",
    path: "/secrets",
    hotkey: "g s",
    icon: "<svg viewBox='0 0 24 24'><path d='M9 10V8a3 3 0 1 1 6 0v2h2v10H7V10zm2 0h2V8a1 1 0 0 0-2 0z'/></svg>",
  },
  {
    group: "Observe",
    name: "Observability",
    path: "/observability",
    hotkey: "g m",
    icon: "<svg viewBox='0 0 24 24'><path d='M4 14h3l2-5 4 9 2-6h5v2h-4l-3 8-4-9-2 5H4z'/></svg>",
  },
  {
    group: "System",
    name: "Settings",
    path: "/settings",
    hotkey: "g ,",
    icon: "<svg viewBox='0 0 24 24'><path d='m12 8 1.5-3h3l1 3 2.5 1.5-1 3 1 3L17.5 17l-1 3h-3L12 17l-1.5 3h-3l-1-3L4 15.5l1-3-1-3L6.5 8l1-3h3z'/></svg>",
  },
];

export const navGroups = ["Operate", "Configure", "Observe", "System"];
