import type { Issue } from "../core/types.js";

export interface RepoRoute {
  repoUrl: string;
  defaultBranch?: string;
  identifierPrefix?: string;
  label?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubTokenEnv?: string;
}

export interface RepoMatch {
  repoUrl: string;
  defaultBranch: string;
  identifierPrefix?: string;
  label?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubTokenEnv: string;
  matchedBy: "identifier_prefix" | "label";
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function issuePrefix(identifier: string): string {
  const [prefix] = identifier.split("-", 1);
  return normalize(prefix ?? identifier);
}

function toMatch(route: RepoRoute, matchedBy: RepoMatch["matchedBy"]): RepoMatch {
  return {
    repoUrl: route.repoUrl,
    defaultBranch: route.defaultBranch?.trim() || "main",
    identifierPrefix: route.identifierPrefix?.trim(),
    label: route.label?.trim(),
    githubOwner: route.githubOwner?.trim() || undefined,
    githubRepo: route.githubRepo?.trim() || undefined,
    githubTokenEnv: route.githubTokenEnv?.trim() || "GITHUB_TOKEN",
    matchedBy,
  };
}

export function matchIssue(issue: Issue, routes: RepoRoute[]): RepoMatch | null {
  if (!Array.isArray(routes) || routes.length === 0) {
    return null;
  }

  const labels = new Set(issue.labels.map(normalize));
  for (const route of routes) {
    const label = route.label?.trim();
    if (!route.repoUrl?.trim() || !label) {
      continue;
    }
    if (labels.has(normalize(label))) {
      return toMatch(route, "label");
    }
  }

  const prefix = issuePrefix(issue.identifier);
  for (const route of routes) {
    const routePrefix = route.identifierPrefix?.trim();
    if (!route.repoUrl?.trim() || !routePrefix) {
      continue;
    }
    if (normalize(routePrefix) === prefix) {
      return toMatch(route, "identifier_prefix");
    }
  }

  return null;
}

export class RepoRouter {
  constructor(private readonly routes: RepoRoute[]) {}

  matchIssue(issue: Issue): RepoMatch | null {
    return matchIssue(issue, this.routes);
  }
}
