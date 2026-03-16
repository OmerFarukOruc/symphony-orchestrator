import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadFlags, isEnabled, setFlag, getAllFlags, getFlagsMeta, resetFlags } from "../src/feature-flags.js";

describe("feature-flags", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    resetFlags();
    delete process.env.SYMPHONY_FLAGS;
    await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("returns false by default for unknown flags", () => {
    expect(isEnabled("nonexistent")).toBe(false);
  });

  it("loads flags from SYMPHONY_FLAGS env var", () => {
    process.env.SYMPHONY_FLAGS = "alpha,beta, gamma ";
    loadFlags();

    expect(isEnabled("alpha")).toBe(true);
    expect(isEnabled("beta")).toBe(true);
    expect(isEnabled("gamma")).toBe(true);
    expect(isEnabled("delta")).toBe(false);
    expect(getFlagsMeta().source).toBe("env");
    expect(getFlagsMeta().count).toBe(3);
  });

  it("loads flags from flags.json file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "flags-test-"));
    tempDirs.push(dir);
    await writeFile(path.join(dir, "flags.json"), JSON.stringify({ feature_x: true, feature_y: false }));

    loadFlags(dir);

    expect(isEnabled("feature_x")).toBe(true);
    expect(isEnabled("feature_y")).toBe(false);
    expect(getFlagsMeta().source).toBe("file");
  });

  it("env flags take precedence but file flags merge", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "flags-test-"));
    tempDirs.push(dir);
    await writeFile(path.join(dir, "flags.json"), JSON.stringify({ from_file: true, shared: false }));
    process.env.SYMPHONY_FLAGS = "shared,from_env";

    loadFlags(dir);

    expect(isEnabled("from_env")).toBe(true);
    // File value overrides env for shared (file loads second)
    expect(isEnabled("shared")).toBe(false);
    expect(isEnabled("from_file")).toBe(true);
  });

  it("setFlag overrides loaded values", () => {
    loadFlags();
    setFlag("runtime_override", true);

    expect(isEnabled("runtime_override")).toBe(true);
    expect(getAllFlags()).toMatchObject({ runtime_override: true });
  });

  it("resetFlags clears everything", () => {
    process.env.SYMPHONY_FLAGS = "alpha";
    loadFlags();
    expect(isEnabled("alpha")).toBe(true);

    resetFlags();
    expect(isEnabled("alpha")).toBe(false);
    expect(getFlagsMeta().source).toBe("default");
    expect(getFlagsMeta().count).toBe(0);
  });
});
