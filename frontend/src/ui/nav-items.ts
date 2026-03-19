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
    group: "Configure",
    name: "Settings",
    path: "/settings",
    hotkey: "g ,",
    icon: "<svg viewBox='0 0 24 24'><path d='m12 8 1.5-3h3l1 3 2.5 1.5-1 3 1 3L17.5 17l-1 3h-3L12 17l-1.5 3h-3l-1-3L4 15.5l1-3-1-3L6.5 8l1-3h3z'/></svg>",
  },
  {
    group: "Observe",
    name: "Observability",
    path: "/observability",
    hotkey: "g m",
    icon: "<svg viewBox='0 0 24 24'><path d='M4 14h3l2-5 4 9 2-6h5v2h-4l-3 8-4-9-2 5H4z'/></svg>",
  },
  {
    group: "Observe",
    name: "Notifications",
    path: "/notifications",
    hotkey: "g n",
    icon: "<svg viewBox='0 0 24 24'><path d='M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z'/></svg>",
  },
  {
    group: "Observe",
    name: "Git",
    path: "/git",
    hotkey: "g g",
    icon: "<svg viewBox='0 0 24 24'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-7v4h4l-5 7z'/></svg>",
  },
  {
    group: "Observe",
    name: "Containers",
    path: "/containers",
    hotkey: "g d",
    icon: "<svg viewBox='0 0 24 24'><path d='M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2h8v2zm4-4H6v-2h12v2z'/></svg>",
  },
  {
    group: "Observe",
    name: "Workspaces",
    path: "/workspaces",
    hotkey: "g w",
    icon: "<svg viewBox='0 0 24 24'><path d='M4 20h16V4H4v16zm2-2V6h12v12H6z'/></svg>",
  },
  {
    group: "System",
    name: "Welcome",
    path: "/welcome",
    hotkey: "g i",
    icon: "<svg viewBox='0 0 24 24'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'/></svg>",
  },
];

export const navGroups = ["Operate", "Configure", "Observe", "System"];
