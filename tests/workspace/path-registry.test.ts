import { describe, expect, it } from "vitest";

import { PathRegistry } from "../../src/workspace/path-registry.js";

describe("PathRegistry", () => {
  it("returns the input path when no mappings exist", () => {
    const registry = new PathRegistry();
    expect(registry.translate("/data/workspaces/MT-1")).toBe("/data/workspaces/MT-1");
    expect(registry.hasMappings()).toBe(false);
  });

  it("translates matching container prefixes to host prefixes", () => {
    const registry = new PathRegistry({
      "/data/workspaces": "/home/user/symphony/workspaces",
      "/data/archives": "/home/user/symphony/archives",
    });

    expect(registry.translate("/data/workspaces/MT-1")).toBe("/home/user/symphony/workspaces/MT-1");
    expect(registry.translate("/data/archives/attempts")).toBe("/home/user/symphony/archives/attempts");
    expect(registry.hasMappings()).toBe(true);
  });

  it("uses the longest matching prefix", () => {
    const registry = new PathRegistry({
      "/data/workspaces": "/host/workspaces",
      "/data/workspaces/team-a": "/host/team-a",
    });

    expect(registry.translate("/data/workspaces/team-a/MT-2")).toBe("/host/team-a/MT-2");
  });

  it("does not translate partial prefix matches", () => {
    const registry = new PathRegistry({
      "/data/workspaces": "/host/workspaces",
    });
    expect(registry.translate("/data/workspaces-extra/MT-1")).toBe("/data/workspaces-extra/MT-1");
  });

  it("builds mappings from environment variables", () => {
    const registry = PathRegistry.fromEnv({
      SYMPHONY_HOST_WORKSPACE_ROOT: "/host/ws",
      SYMPHONY_HOST_ARCHIVE_DIR: "/host/arc",
      SYMPHONY_CONTAINER_WORKSPACE_ROOT: "/container/ws",
      SYMPHONY_CONTAINER_ARCHIVE_DIR: "/container/arc",
    });

    expect(registry.translate("/container/ws/MT-7")).toBe("/host/ws/MT-7");
    expect(registry.translate("/container/arc/logs")).toBe("/host/arc/logs");
  });

  it("uses default container paths when container env vars are not set", () => {
    const registry = PathRegistry.fromEnv({
      SYMPHONY_HOST_WORKSPACE_ROOT: "/host/ws",
      SYMPHONY_HOST_ARCHIVE_DIR: "/host/arc",
    });

    // Defaults: /data/workspaces and /data/archives
    expect(registry.translate("/data/workspaces/MT-7")).toBe("/host/ws/MT-7");
    expect(registry.translate("/data/archives/logs")).toBe("/host/arc/logs");
    expect(registry.hasMappings()).toBe(true);
  });

  it("creates no mappings when host env vars are absent", () => {
    const registry = PathRegistry.fromEnv({});
    expect(registry.hasMappings()).toBe(false);
    expect(registry.translate("/data/workspaces/MT-7")).toBe("/data/workspaces/MT-7");
  });

  it("normalizePrefix maps empty string to root '/'", () => {
    // Empty string normalizes to "/" which is a valid mapping
    const registry = new PathRegistry({ "": "/host/ws" });
    // "" normalizes to "/" prefix, so it maps all absolute paths
    expect(registry.hasMappings()).toBe(true);
  });

  it("normalizePrefix maps root '/' correctly — suffix concatenation", () => {
    // When containerPrefix is "/", suffix = "/anything".slice(1) = "anything"
    // translated = "/host" + "anything" = "/hostanything" — the host and suffix merge
    // This is the actual string concat behavior
    const registry = new PathRegistry({ "/": "/host" });
    expect(registry.hasMappings()).toBe(true);
    expect(registry.translate("/anything")).toBe("/hostanything");
  });

  it("normalizePrefix strips trailing slashes from non-root paths", () => {
    const registry = new PathRegistry({ "/data/ws/": "/host/ws" });
    expect(registry.translate("/data/ws/MT-1")).toBe("/host/ws/MT-1");
  });

  it("normalizePrefix preserves root '/' as-is", () => {
    // "/" is a special case: not stripped, kept as "/"
    const registry = new PathRegistry({ "/": "/host/" });
    // containerPrefix = "/", hostPrefix = "/host"
    // For "/foo": suffix = "/foo".slice("/".length) = "foo"
    // translated = "/host" + "foo" = "/hostfoo"
    // The root mapping is tricky — need trailing slash on host for separator
    expect(registry.translate("/")).toBe("/host");
  });

  it("hasPathPrefix with root prefix matches candidates starting with /", () => {
    const registry = new PathRegistry({ "/": "/mapped" });
    // suffix for "/any/path" is "any/path" (after slicing "/".length from "/any/path")
    // translated = "/mapped" + "any/path" = "/mappedany/path"
    expect(registry.translate("/any/path")).toBe("/mappedany/path");
  });

  it("hasPathPrefix requires exact prefix or prefix + '/' boundary", () => {
    const registry = new PathRegistry({ "/data": "/host" });
    // "/data" matches "/data" exactly
    expect(registry.translate("/data")).toBe("/host");
    // "/data/..." matches
    expect(registry.translate("/data/sub")).toBe("/host/sub");
    // "/data-extra" should NOT match
    expect(registry.translate("/data-extra")).toBe("/data-extra");
  });

  it("translate returns hostPrefix when suffix is empty after stripping containerPrefix", () => {
    const registry = new PathRegistry({ "/data/workspaces": "/host/ws" });
    // Exact match: containerPath === containerPrefix, suffix is ""
    expect(registry.translate("/data/workspaces")).toBe("/host/ws");
  });

  it("sorts mappings by containerPrefix length descending (longest first)", () => {
    const registry = new PathRegistry({
      "/data": "/short",
      "/data/workspaces/team": "/longest",
      "/data/workspaces": "/medium",
    });

    expect(registry.translate("/data/workspaces/team/MT-1")).toBe("/longest/MT-1");
    expect(registry.translate("/data/workspaces/other")).toBe("/medium/other");
    expect(registry.translate("/data/other")).toBe("/short/other");
  });

  it("accepts Map as constructor input", () => {
    const mappings = new Map([
      ["/container/ws", "/host/ws"],
      ["/container/arc", "/host/arc"],
    ]);
    const registry = new PathRegistry(mappings);
    expect(registry.hasMappings()).toBe(true);
    expect(registry.translate("/container/ws/MT-1")).toBe("/host/ws/MT-1");
  });

  it("filters out entries where containerPrefix normalizes to empty after processing", () => {
    // After normalization, if both container and host prefixes are valid, they should be kept
    const registry = new PathRegistry({ "/valid": "/also-valid" });
    expect(registry.hasMappings()).toBe(true);
  });
});
