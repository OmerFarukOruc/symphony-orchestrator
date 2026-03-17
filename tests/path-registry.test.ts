import { describe, expect, it } from "vitest";

import { PathRegistry } from "../src/path-registry.js";

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
});
