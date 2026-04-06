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
      "/data/workspaces": "/home/user/risoluto/workspaces",
      "/data/archives": "/home/user/risoluto/archives",
    });

    expect(registry.translate("/data/workspaces/MT-1")).toBe("/home/user/risoluto/workspaces/MT-1");
    expect(registry.translate("/data/archives/attempts")).toBe("/home/user/risoluto/archives/attempts");
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
      RISOLUTO_HOST_WORKSPACE_ROOT: "/host/ws",
      RISOLUTO_HOST_ARCHIVE_DIR: "/host/arc",
      RISOLUTO_CONTAINER_WORKSPACE_ROOT: "/container/ws",
      RISOLUTO_CONTAINER_ARCHIVE_DIR: "/container/arc",
    });

    expect(registry.translate("/container/ws/MT-7")).toBe("/host/ws/MT-7");
    expect(registry.translate("/container/arc/logs")).toBe("/host/arc/logs");
  });

  it("normalizes trailing slashes on both mapping prefixes and translated paths", () => {
    const registry = new PathRegistry({
      "/data/workspaces/": "/host/workspaces/",
    });

    expect(registry.translate("/data/workspaces/team-a/")).toBe("/host/workspaces/team-a");
  });

  it("supports root prefix mappings", () => {
    const registry = new PathRegistry({
      "/": "/host-root",
    });

    expect(registry.translate("/data/workspaces/MT-1")).toBe("/host-rootdata/workspaces/MT-1");
    expect(registry.translate("/")).toBe("/host-root");
    expect(registry.translate("relative/path")).toBe("relative/path");
  });

  it("uses default container roots from env when only host paths are configured", () => {
    const registry = PathRegistry.fromEnv({
      RISOLUTO_HOST_WORKSPACE_ROOT: "/host/ws",
      RISOLUTO_HOST_ARCHIVE_DIR: "/host/arc",
    });

    expect(registry.translate("/data/workspaces/MT-7")).toBe("/host/ws/MT-7");
    expect(registry.translate("/data/archives/logs")).toBe("/host/arc/logs");
  });

  it("normalizes map-based mappings before sorting and translating", () => {
    const registry = new PathRegistry(
      new Map([
        ["/data/workspaces/team-a/", "/host/team-a/"],
        ["/data/workspaces/", "/host/workspaces/"],
      ]),
    );

    expect(registry.translate("/data/workspaces/team-a/MT-2")).toBe("/host/team-a/MT-2");
  });

  it("treats empty mapping prefixes like root prefixes after normalization", () => {
    const registry = new PathRegistry({
      "": "/host-root",
    });

    expect(registry.translate("/data/workspaces/MT-1")).toBe("/host-rootdata/workspaces/MT-1");
  });
});
