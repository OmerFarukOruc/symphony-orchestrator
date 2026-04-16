import type { NextFunction, Request, Response } from "express";

import { includesMatchingToken } from "./token-compare.js";
import { isLoopbackAddress } from "./write-guard.js";

const SAFE_READ_METHODS = new Set(["GET", "HEAD"]);
const PUBLIC_READ_PATHS = new Set(["/api/v1/runtime", "/api/v1/openapi.json"]);
const PROTECTED_READ_PREFIXES = [
  "/api/v1/state",
  "/api/v1/events",
  "/api/v1/models",
  "/api/v1/transitions",
  "/api/v1/git/context",
  "/api/v1/workspaces",
  "/api/v1/templates",
  "/api/v1/config",
  "/api/v1/secrets",
  "/api/v1/audit",
  "/api/v1/attempts",
];

const DYNAMIC_ISSUE_ROUTE_PREFIXES = new Set([
  "state",
  "runtime",
  "models",
  "transitions",
  "attempts",
  "config",
  "secrets",
  "audit",
  "setup",
  "git",
  "workspaces",
  "templates",
  "openapi.json",
]);

function resolveConfiguredReadTokens(): string[] {
  const readToken = process.env.RISOLUTO_READ_TOKEN?.trim() || "";
  const writeToken = process.env.RISOLUTO_WRITE_TOKEN?.trim() || "";
  return [...new Set([readToken, writeToken].filter(Boolean))];
}

function extractBearerToken(req: Request): string | null {
  const authorization = req.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice(7).trim();
  return token || null;
}

function isProtectedIssueDetailPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 3 && segments[0] === "api" && segments[1] === "v1") {
    return !DYNAMIC_ISSUE_ROUTE_PREFIXES.has(segments[2]);
  }
  if (segments.length === 4 && segments[0] === "api" && segments[1] === "v1" && segments[3] === "attempts") {
    return !DYNAMIC_ISSUE_ROUTE_PREFIXES.has(segments[2]);
  }
  return false;
}

function isProtectedReadPath(pathname: string): boolean {
  if (PUBLIC_READ_PATHS.has(pathname)) {
    return false;
  }
  if (PROTECTED_READ_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  return isProtectedIssueDetailPath(pathname);
}

export function hasConfiguredReadAccessToken(): boolean {
  return resolveConfiguredReadTokens().length > 0;
}

export function createReadGuard(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!SAFE_READ_METHODS.has(req.method) || !isProtectedReadPath(req.path)) {
      next();
      return;
    }

    if (isLoopbackAddress(req.socket.remoteAddress)) {
      next();
      return;
    }

    const configuredHeaderTokens = resolveConfiguredReadTokens();
    const configuredQueryTokens = configuredHeaderTokens;
    if (configuredHeaderTokens.length === 0 && configuredQueryTokens.length === 0) {
      res.status(403).json({
        error: {
          code: "read_forbidden",
          message:
            "Sensitive read routes are only allowed from loopback addresses. " +
            "Set RISOLUTO_READ_TOKEN or RISOLUTO_WRITE_TOKEN to allow remote read access.",
        },
      });
      return;
    }

    // Bearer token from Authorization header
    const bearerToken = extractBearerToken(req);
    if (bearerToken) {
      if (includesMatchingToken(bearerToken, configuredHeaderTokens)) {
        next();
        return;
      }

      res.status(401).json({
        error: {
          code: "read_unauthorized",
          message: "Sensitive read routes require a valid read token.",
        },
      });
      return;
    }

    // Query-string token (?read_token=...) — used by browser EventSource which cannot send headers
    const queryValue = req.query["read_token"];
    const queryToken = typeof queryValue === "string" ? queryValue : null;
    if (queryToken) {
      if (includesMatchingToken(queryToken, configuredQueryTokens)) {
        next();
        return;
      }

      res.status(401).json({
        error: {
          code: "read_unauthorized",
          message: "Sensitive read routes require a valid read token.",
        },
      });
      return;
    }

    res.status(401).json({
      error: {
        code: "read_unauthorized",
        message: "Sensitive read routes require a valid read token.",
      },
    });
  };
}
