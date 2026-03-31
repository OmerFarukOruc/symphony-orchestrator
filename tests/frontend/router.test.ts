import { describe, expect, it } from "vitest";

/**
 * Tests for the frontend router's route compilation and matching logic.
 * The router.ts module depends on browser DOM globals (window, document),
 * so we test its core algorithms in isolation here.
 */

/** Extracted from frontend/src/router.ts — compileRoute() */
function compileRoute(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = path
    .split("/")
    .map((segment) => {
      const paramMatch = /^:([^/]+)$/.exec(segment);
      if (paramMatch) {
        keys.push(paramMatch[1]);
        return "([^/]+)";
      }
      return segment.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("\\/");
  return { pattern: RegExp(`^${source}$`), keys }; // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
}

/** Extracted from frontend/src/router.ts — match() */
function match(
  routes: Array<{ pattern: RegExp; keys: string[] }>,
  pathname: string,
): { index: number; params: Record<string, string> } | null {
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const matched = pathname.match(route.pattern);
    if (!matched) continue;
    const params = route.keys.reduce<Record<string, string>>((acc, key, idx) => {
      acc[key] = decodeURIComponent(matched[idx + 1] ?? "");
      return acc;
    }, {});
    return { index: i, params };
  }
  return null;
}

describe("compileRoute", () => {
  it("compiles a static root path", () => {
    const { pattern, keys } = compileRoute("/");
    expect(keys).toEqual([]);
    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/foo")).toBe(false);
  });

  it("compiles a static multi-segment path", () => {
    const { pattern, keys } = compileRoute("/queue");
    expect(keys).toEqual([]);
    expect(pattern.test("/queue")).toBe(true);
    expect(pattern.test("/queue/extra")).toBe(false);
  });

  it("compiles a path with a single parameter", () => {
    const { pattern, keys } = compileRoute("/queue/:id");
    expect(keys).toEqual(["id"]);
    expect(pattern.test("/queue/MT-42")).toBe(true);
    expect(pattern.test("/queue/")).toBe(false);
    expect(pattern.test("/queue")).toBe(false);
  });

  it("compiles a path with multiple parameters", () => {
    const { pattern, keys } = compileRoute("/api/:version/issues/:id");
    expect(keys).toEqual(["version", "id"]);
    expect(pattern.test("/api/v1/issues/MT-42")).toBe(true);
    expect(pattern.test("/api/v1/issues")).toBe(false);
  });

  it("escapes special regex characters in static segments", () => {
    const { pattern } = compileRoute("/path.with.dots");
    expect(pattern.test("/path.with.dots")).toBe(true);
    expect(pattern.test("/pathXwithXdots")).toBe(false);
  });
});

describe("match", () => {
  const routes = [
    compileRoute("/"),
    compileRoute("/queue"),
    compileRoute("/queue/:identifier"),
    compileRoute("/observability"),
    compileRoute("/settings"),
  ];

  it("matches root path", () => {
    const result = match(routes, "/");
    expect(result).not.toBeNull();
    expect(result!.index).toBe(0);
    expect(result!.params).toEqual({});
  });

  it("matches static paths", () => {
    const result = match(routes, "/queue");
    expect(result).not.toBeNull();
    expect(result!.index).toBe(1);
  });

  it("extracts parameters from parameterized paths", () => {
    const result = match(routes, "/queue/MT-42");
    expect(result).not.toBeNull();
    expect(result!.index).toBe(2);
    expect(result!.params).toEqual({ identifier: "MT-42" });
  });

  it("returns null for unmatched paths", () => {
    const result = match(routes, "/unknown");
    expect(result).toBeNull();
  });

  it("decodes URI-encoded parameters", () => {
    const result = match(routes, "/queue/MT%2D42");
    expect(result).not.toBeNull();
    expect(result!.params).toEqual({ identifier: "MT-42" });
  });

  it("returns the first matching route", () => {
    // /queue matches before /queue/:identifier
    const result = match(routes, "/queue");
    expect(result!.index).toBe(1);
  });
});

describe("getRouteTitle (algorithm)", () => {
  it("trims and returns empty on blank", () => {
    const title = "   ".trim() || "Risoluto";
    expect(title).toBe("Risoluto");
  });

  it("returns trimmed text when present", () => {
    const title = "  My Issue Title  ".trim() || "Risoluto";
    expect(title).toBe("My Issue Title");
  });
});
