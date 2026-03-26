import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasCodexAuthFile,
  hasLinearCredentials,
  readProjectSlug,
  hasRepoRoutes,
} from "../../src/setup/setup-status.js";
import { SecretsStore } from "../../src/secrets/store.js";
import { createMockLogger } from "../helpers.js";

/* ── fs mock (hoisted) ───────────────────────────────────────────── */

const existsSyncMock = vi.hoisted(() => vi.fn<(filePath: string) => boolean>());

vi.mock("node:fs", () => ({ existsSync: existsSyncMock }));

/* ── SecretsStore helper ─────────────────────────────────────────── */

function makeSecretsStore(): SecretsStore {
  const store = new SecretsStore("/tmp/secrets-test", createMockLogger());
  vi.spyOn(store, "get").mockReturnValue(null);
  return store;
}

/* ── env snapshot ────────────────────────────────────────────────── */

const originalEnv = { ...process.env };

beforeEach(() => {
  existsSyncMock.mockReset();
  existsSyncMock.mockReturnValue(false);
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

/* ── readOverlayString — flat-key vs nested-path resolution ─────── */

describe("readOverlayString resolution (via hasCodexAuthFile)", () => {
  it("resolves flat-key overlay (codex.auth.source_home)", () => {
    existsSyncMock.mockReturnValue(true);

    const overlay = { "codex.auth.source_home": "/custom/auth" };
    expect(hasCodexAuthFile("/archive", overlay)).toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith("/custom/auth/auth.json");
  });

  it("resolves nested-path overlay (codex → auth → source_home)", () => {
    existsSyncMock.mockReturnValue(true);

    const overlay = { codex: { auth: { source_home: "/nested/auth" } } };
    expect(hasCodexAuthFile("/archive", overlay)).toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith("/nested/auth/auth.json");
  });

  it("falls back to archive-based path when no overlay is set", () => {
    existsSyncMock.mockReturnValue(false);

    expect(hasCodexAuthFile("/archive", {})).toBe(false);
    expect(existsSyncMock).toHaveBeenCalledWith("/archive/codex-auth/auth.json");
  });

  it("returns false when auth.mode is empty string", () => {
    const overlay = { "codex.auth.mode": "" };
    expect(hasCodexAuthFile("/archive", overlay)).toBe(false);
  });

  it("returns false when source_home is empty string", () => {
    const overlay = { "codex.auth.source_home": "" };
    expect(hasCodexAuthFile("/archive", overlay)).toBe(false);
  });
});

/* ── prototype-pollution defense ─────────────────────────────────── */

describe("prototype-pollution defense", () => {
  it("does not resolve inherited properties from prototype chain", () => {
    // readOverlayString uses Object.getOwnPropertyDescriptor, so inherited
    // properties should NOT be resolved
    const proto = { tracker: { project_slug: "inherited-slug" } };
    const overlay = Object.create(proto) as Record<string, unknown>;
    expect(readProjectSlug(overlay)).toBeUndefined();
  });

  it("does not resolve constructor from Object.prototype", () => {
    const overlay: Record<string, unknown> = {};
    expect(readProjectSlug(overlay)).toBeUndefined();
  });

  it("resolves own properties normally", () => {
    const overlay: Record<string, unknown> = { tracker: { project_slug: "SAFE-SLUG" } };
    expect(readProjectSlug(overlay)).toBe("SAFE-SLUG");
  });
});

/* ── hasCodexAuthFile ────────────────────────────────────────────── */

describe("hasCodexAuthFile", () => {
  it("returns true when auth.json exists in the derived path", () => {
    existsSyncMock.mockReturnValue(true);
    expect(hasCodexAuthFile("/archive", {})).toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith("/archive/codex-auth/auth.json");
  });

  it("returns false when auth.json does not exist", () => {
    existsSyncMock.mockReturnValue(false);
    expect(hasCodexAuthFile("/archive", {})).toBe(false);
  });

  it("prefers flat key over nested when both are present", () => {
    existsSyncMock.mockReturnValue(true);
    const overlay = {
      "codex.auth.source_home": "/flat-wins",
      codex: { auth: { source_home: "/nested-loses" } },
    };
    expect(hasCodexAuthFile("/archive", overlay)).toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith("/flat-wins/auth.json");
  });

  it("falls through to default when flat value is not a string", () => {
    existsSyncMock.mockReturnValue(true);
    const overlay = { "codex.auth.source_home": 42 };
    expect(hasCodexAuthFile("/archive", overlay as Record<string, unknown>)).toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith("/archive/codex-auth/auth.json");
  });
});

/* ── hasLinearCredentials ────────────────────────────────────────── */

describe("hasLinearCredentials", () => {
  it("returns true when secrets store has the key", () => {
    const store = makeSecretsStore();
    vi.mocked(store.get).mockReturnValue("lin_api_xxx");
    expect(hasLinearCredentials(store)).toBe(true);
  });

  it("returns true when environment variable is set", () => {
    const store = makeSecretsStore();
    process.env.LINEAR_API_KEY = "env_key";
    expect(hasLinearCredentials(store)).toBe(true);
  });

  it("returns false when neither store nor env has the key", () => {
    const store = makeSecretsStore();
    delete process.env.LINEAR_API_KEY;
    expect(hasLinearCredentials(store)).toBe(false);
  });

  it("returns false when env variable is empty string", () => {
    const store = makeSecretsStore();
    process.env.LINEAR_API_KEY = "";
    expect(hasLinearCredentials(store)).toBe(false);
  });
});

/* ── readProjectSlug ─────────────────────────────────────────────── */

describe("readProjectSlug", () => {
  it("reads flat-key slug", () => {
    expect(readProjectSlug({ "tracker.project_slug": "MY-PROJECT" })).toBe("MY-PROJECT");
  });

  it("reads nested-path slug", () => {
    expect(readProjectSlug({ tracker: { project_slug: "NESTED-SLUG" } })).toBe("NESTED-SLUG");
  });

  it("returns undefined when slug is absent", () => {
    expect(readProjectSlug({})).toBeUndefined();
  });

  it("returns undefined when slug is empty string", () => {
    expect(readProjectSlug({ "tracker.project_slug": "" })).toBeUndefined();
  });

  it("returns undefined when nested value is non-string", () => {
    expect(readProjectSlug({ tracker: { project_slug: 123 } })).toBeUndefined();
  });
});

/* ── hasRepoRoutes ───────────────────────────────────────────────── */

describe("hasRepoRoutes", () => {
  it("returns true when repos is a non-empty array", () => {
    expect(hasRepoRoutes({ repos: [{ url: "https://github.com/org/repo" }] })).toBe(true);
  });

  it("returns false when repos is an empty array", () => {
    expect(hasRepoRoutes({ repos: [] })).toBe(false);
  });

  it("returns false when repos is not an array", () => {
    expect(hasRepoRoutes({ repos: "not-an-array" })).toBe(false);
  });

  it("returns false when repos key is absent", () => {
    expect(hasRepoRoutes({})).toBe(false);
  });

  it("returns false when repos is null", () => {
    expect(hasRepoRoutes({ repos: null })).toBe(false);
  });
});
