import type { IconName } from "./icons";

export interface NavItem {
  group: string;
  name: string;
  path: string;
  hotkey: string;
  icon: IconName;
}

export const navItems: NavItem[] = [
  {
    group: "Operate",
    name: "Overview",
    path: "/",
    hotkey: "g o",
    icon: "overview",
  },
  {
    group: "Operate",
    name: "Board",
    path: "/queue",
    hotkey: "g q",
    icon: "board",
  },

  {
    group: "Configure",
    name: "Settings",
    path: "/settings",
    hotkey: "g ,",
    icon: "settings",
  },
  {
    group: "Configure",
    name: "Templates",
    path: "/templates",
    hotkey: "g t",
    icon: "templates",
  },
  {
    group: "Observe",
    name: "Observability",
    path: "/observability",
    hotkey: "g m",
    icon: "observability",
  },
  {
    group: "Observe",
    name: "Notifications",
    path: "/notifications",
    hotkey: "g n",
    icon: "notifications",
  },
  {
    group: "Observe",
    name: "Git",
    path: "/git",
    hotkey: "g g",
    icon: "git",
  },
  {
    group: "Observe",
    name: "Containers",
    path: "/containers",
    hotkey: "g d",
    icon: "containers",
  },
  {
    group: "Observe",
    name: "Workspaces",
    path: "/workspaces",
    hotkey: "g w",
    icon: "workspaces",
  },
  {
    group: "Observe",
    name: "Audit Log",
    path: "/audit",
    hotkey: "g a",
    icon: "audit",
  },
  {
    group: "System",
    name: "Setup",
    path: "/setup",
    hotkey: "g u",
    icon: "settings",
  },
];

export const navGroups = ["Operate", "Configure", "Observe", "System"];
