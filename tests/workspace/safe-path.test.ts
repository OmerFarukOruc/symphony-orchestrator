import { describe, expect, it, afterEach } from "vitest";

import { buildSafePath } from "../../src/workspace/manager.js";

describe("buildSafePath", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("keeps only well-known system directories from PATH", () => {
    process.env.PATH = "/usr/local/bin:/usr/bin:/bin:/home/user/.local/bin:/opt/custom/bin";
    const result = buildSafePath();
    expect(result).toBe("/usr/local/bin:/usr/bin:/bin");
  });

  it("includes sbin directories when present", () => {
    process.env.PATH = "/usr/sbin:/sbin:/usr/local/sbin:/usr/bin";
    const result = buildSafePath();
    expect(result).toBe("/usr/sbin:/sbin:/usr/local/sbin:/usr/bin");
  });

  it("returns fallback when PATH has no safe directories", () => {
    process.env.PATH = "/home/user/bin:/opt/custom/bin";
    const result = buildSafePath();
    expect(result).toBe("/usr/local/bin:/usr/bin:/bin");
  });

  it("returns fallback when PATH is unset", () => {
    delete process.env.PATH;
    const result = buildSafePath();
    expect(result).toBe("/usr/local/bin:/usr/bin:/bin");
  });
});
