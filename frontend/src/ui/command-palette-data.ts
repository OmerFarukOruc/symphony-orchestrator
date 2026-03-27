import { api } from "../api";
import { router } from "../router";
import type { RuntimeIssueView } from "../types";
import { collectUniqueIssues } from "./sidebar-badges.js";
import { openShortcutHelp } from "./shortcut-help.js";
import { navItems } from "./nav-items";
import { toggleTheme } from "./theme";
import { toast } from "./toast";
import type { IconName } from "./icons";

export interface PaletteEntry {
  id: string;
  name: string;
  description: string;
  meta: string;
  group: string;
  icon: IconName;
  keywords: string[];
  run: () => void | Promise<void>;
}

interface CreateBasePaletteEntriesOptions {
  resolveRunHistoryPath?: () => string | null;
}

function buildNavigationEntries(): PaletteEntry[] {
  const entries = navItems.map((item) => ({
    id: `nav:${item.path}`,
    name: item.name,
    description: `Open ${item.name}`,
    meta: item.hotkey,
    group: "Navigation",
    icon: item.icon,
    keywords: [item.group, item.path, item.name],
    run: () => router.navigate(item.path),
  }));

  entries.push(
    {
      id: "nav:/settings#credentials",
      name: "Credentials",
      description: "Open Settings · Credentials",
      meta: "g s",
      group: "Navigation",
      icon: "secrets",
      keywords: ["configure", "credentials", "secret", "secrets", "/secrets", "/settings#credentials"],
      run: () => router.navigate("/settings#credentials"),
    },
    {
      id: "nav:/settings#devtools",
      name: "Developer tools",
      description: "Open Settings · Developer tools",
      meta: "g c",
      group: "Navigation",
      icon: "config",
      keywords: ["configure", "config", "devtools", "developer", "override", "/config", "/settings#devtools"],
      run: () => router.navigate("/settings#devtools"),
    },
  );

  return entries;
}

function buildQuickActionEntries(options: CreateBasePaletteEntriesOptions): PaletteEntry[] {
  const entries: PaletteEntry[] = [
    {
      id: "action:refresh",
      name: "Refresh runtime state",
      description: "Queue an immediate orchestrator refresh.",
      meta: "Action",
      group: "Quick actions",
      icon: "refresh",
      keywords: ["refresh", "reload", "sync"],
      run: async () => {
        await api.postRefresh();
        toast("Refresh queued.", "success");
      },
    },
    {
      id: "action:theme",
      name: "Toggle theme",
      description: "Switch between dark and light themes.",
      meta: "Action",
      group: "Quick actions",
      icon: "theme",
      keywords: ["theme", "dark", "light", "appearance"],
      run: () => {
        const nextTheme = toggleTheme();
        toast(`Theme: ${nextTheme}`, "info");
      },
    },
    {
      id: "action:shortcuts",
      name: "Show keyboard shortcuts",
      description: "Open the shortcuts help overlay.",
      meta: "?",
      group: "Quick actions",
      icon: "settings",
      keywords: ["shortcuts", "help", "keyboard", "discover"],
      run: () => openShortcutHelp(),
    },
    {
      id: "action:api-docs",
      name: "API documentation",
      description: "Open the Swagger UI API reference",
      meta: "Action",
      group: "Quick actions",
      icon: "issueDetail",
      keywords: ["api", "docs", "swagger", "openapi", "reference"],
      run: () => window.open("/api/docs", "_blank", "noopener"),
    },
  ];

  const runsPath = options.resolveRunHistoryPath?.();
  if (runsPath) {
    entries.push({
      id: "action:runs",
      name: "Open current issue runs",
      description: "Jump to the current issue run history.",
      meta: "g r",
      group: "Quick actions",
      icon: "overview",
      keywords: ["runs", "history", "attempts"],
      run: () => router.navigate(runsPath),
    });
  }

  return entries;
}

function buildIssueEntries(issues: RuntimeIssueView[]): PaletteEntry[] {
  return issues.map((issue) => ({
    id: `issue:${issue.identifier}`,
    name: `${issue.identifier} · ${issue.title}`,
    description: `Open issue detail · ${issue.state}`,
    meta: issue.status,
    group: "Recent issues",
    icon: "board",
    keywords: [issue.identifier, issue.title, issue.state, issue.status, ...(issue.labels ?? [])],
    run: () => router.navigate(`/issues/${encodeURIComponent(issue.identifier)}`),
  }));
}

function buildPullRequestEntries(details: Array<{ identifier: string; title: string; url: string }>): PaletteEntry[] {
  return details.map((detail) => ({
    id: `pr:${detail.identifier}`,
    name: `${detail.identifier} PR`,
    description: detail.title,
    meta: "Pull request",
    group: "Recent PRs",
    icon: "git",
    keywords: [detail.identifier, detail.title, detail.url, "pull request", "pr"],
    run: () => {
      window.open(detail.url, "_blank", "noopener");
    },
  }));
}

function scoreValue(query: string, value: string): number {
  const haystack = value.toLowerCase();
  if (query.length === 0) {
    return 1;
  }
  if (haystack.startsWith(query)) {
    return 120 - haystack.length;
  }
  if (haystack.includes(query)) {
    return 90 - haystack.indexOf(query);
  }

  let cursor = -1;
  let score = 0;
  for (const char of query) {
    cursor = haystack.indexOf(char, cursor + 1);
    if (cursor === -1) {
      return -1;
    }
    score += 4;
  }

  const initials = haystack
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("");
  if (initials.startsWith(query)) {
    score += 16;
  }

  return Math.max(score, 1);
}

export function createBasePaletteEntries(options: CreateBasePaletteEntriesOptions = {}): PaletteEntry[] {
  return [...buildNavigationEntries(), ...buildQuickActionEntries(options)];
}

export function filterPaletteEntries(entries: PaletteEntry[], query: string): PaletteEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  return entries
    .map((entry) => {
      const score = Math.max(
        scoreValue(normalizedQuery, entry.name),
        scoreValue(normalizedQuery, entry.description),
        scoreValue(normalizedQuery, entry.meta),
        ...entry.keywords.map((keyword) => scoreValue(normalizedQuery, keyword)),
      );
      return { entry, score };
    })
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.entry.group !== right.entry.group) {
        return left.entry.group.localeCompare(right.entry.group);
      }
      return left.entry.name.localeCompare(right.entry.name);
    })
    .map((candidate) => candidate.entry);
}

export async function fetchDynamicPaletteEntries(): Promise<PaletteEntry[]> {
  const snapshot = await api.getState();
  const issues = collectUniqueIssues(snapshot)
    .sort((left, right) => {
      const leftUpdatedAt = left.updatedAt ?? left.createdAt ?? "";
      const rightUpdatedAt = right.updatedAt ?? right.createdAt ?? "";
      return rightUpdatedAt.localeCompare(leftUpdatedAt);
    })
    .slice(0, 8);
  const issueEntries = buildIssueEntries(issues);
  const details = await Promise.all(
    issues.slice(0, 5).map(async (issue) => {
      try {
        const detail = await api.getIssue(issue.identifier);
        if (!detail.pullRequestUrl) {
          return null;
        }
        return {
          identifier: issue.identifier,
          title: issue.title,
          url: detail.pullRequestUrl,
        };
      } catch {
        return null;
      }
    }),
  );
  return [...issueEntries, ...buildPullRequestEntries(details.filter((detail) => detail !== null))];
}
