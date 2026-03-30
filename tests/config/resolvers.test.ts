import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveConfigString, resolvePathConfigString } from "../../src/config/resolvers.js";

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(() => {
  process.env = originalEnv;
});

describe("resolveConfigString", () => {
  describe("literal values", () => {
    it("returns a plain string as-is", () => {
      expect(resolveConfigString("hello")).toBe("hello");
    });

    it("returns empty string for non-string inputs", () => {
      expect(resolveConfigString(undefined)).toBe("");
      expect(resolveConfigString(null)).toBe("");
      expect(resolveConfigString(42)).toBe("");
      expect(resolveConfigString({})).toBe("");
    });
  });

  describe("$VAR expansion", () => {
    it("resolves a $VAR reference from process.env", () => {
      process.env.SYMPHONY_TEST_VAR = "resolved-value";
      expect(resolveConfigString("$SYMPHONY_TEST_VAR")).toBe("resolved-value");
    });

    it("returns empty string when the env var is missing", () => {
      delete process.env.SYMPHONY_MISSING_VAR;
      expect(resolveConfigString("$SYMPHONY_MISSING_VAR")).toBe("");
    });

    it("does not expand vars embedded in longer strings", () => {
      process.env.SYMPHONY_TEST_VAR = "val";
      expect(resolveConfigString("prefix-$SYMPHONY_TEST_VAR")).toBe("prefix-$SYMPHONY_TEST_VAR");
    });

    it("does not expand invalid var names", () => {
      expect(resolveConfigString("$123invalid")).toBe("$123invalid");
    });

    it("returns non-dollar-prefixed strings as-is (startsWith guard)", () => {
      expect(resolveConfigString("no-dollar")).toBe("no-dollar");
      expect(resolveConfigString("/absolute/path")).toBe("/absolute/path");
      expect(resolveConfigString("")).toBe("");
    });

    it("returns a plain string without $ prefix exactly as provided", () => {
      // This test kills startsWith("") mutant -- startsWith("") returns true for all strings,
      // which would cause "hello" to fall through to env var lookup instead of being returned as-is
      const result = resolveConfigString("hello-world");
      expect(result).toBe("hello-world");
    });

    it("returns the literal value when string does not start with $ (not treated as env var)", () => {
      // Ensures the !startsWith("$") guard returns the value, not empty string
      delete process.env.SYMPHONY_LITERAL_TEST;
      expect(resolveConfigString("literal-value")).toBe("literal-value");
      expect(resolveConfigString("https://example.com")).toBe("https://example.com");
    });

    it("returns strings that start with $ but are not valid var names as-is", () => {
      expect(resolveConfigString("$has spaces")).toBe("$has spaces");
      expect(resolveConfigString("$has-dashes")).toBe("$has-dashes");
      expect(resolveConfigString("$multi$vars")).toBe("$multi$vars");
    });
  });

  describe("$SECRET:name expansion", () => {
    it("resolves a secret via the secretResolver callback", () => {
      const resolver = (name: string) => (name === "my-key" ? "secret-val" : undefined);
      expect(resolveConfigString("$SECRET:my-key", resolver)).toBe("secret-val");
    });

    it("returns empty string when secretResolver returns undefined", () => {
      const resolver = () => undefined;
      expect(resolveConfigString("$SECRET:unknown", resolver)).toBe("");
    });

    it("returns empty string when no secretResolver is provided", () => {
      expect(resolveConfigString("$SECRET:some-key")).toBe("");
    });

    it("supports dots and hyphens in secret names", () => {
      const resolver = (name: string) => (name === "my.secret-name" ? "found" : undefined);
      expect(resolveConfigString("$SECRET:my.secret-name", resolver)).toBe("found");
    });

    it("requires $SECRET: at the start of the string (not mid-string)", () => {
      const resolver = (name: string) => (name === "key" ? "val" : undefined);
      expect(resolveConfigString("prefix$SECRET:key", resolver)).toBe("prefix$SECRET:key");
    });

    it("requires the secret name to end at the string boundary", () => {
      const resolver = (name: string) => (name === "key" ? "val" : undefined);
      expect(resolveConfigString("$SECRET:key/extra", resolver)).toBe("$SECRET:key/extra");
    });
  });

  describe("home path (~) expansion", () => {
    it("expands bare ~ to HOME", () => {
      process.env.HOME = "/home/testuser";
      expect(resolveConfigString("~")).toBe("/home/testuser");
    });

    it("expands ~/ prefix with HOME", () => {
      process.env.HOME = "/home/testuser";
      expect(resolveConfigString("~/docs")).toBe(path.join("/home/testuser", "docs"));
    });

    it("falls back to ~ when HOME is not set", () => {
      delete process.env.HOME;
      expect(resolveConfigString("~")).toBe("~");
    });

    it("falls back to ~ prefix in path when HOME is not set", () => {
      delete process.env.HOME;
      const result = resolveConfigString("~/subdir");
      expect(result).toBe(path.join("~", "subdir"));
    });
  });

  describe("$TMPDIR expansion", () => {
    it("replaces $TMPDIR with the actual temp directory", () => {
      process.env.TMPDIR = "/custom/tmp";
      expect(resolveConfigString("$TMPDIR")).toBe("/custom/tmp");
    });

    it("returns empty string when TMPDIR env is not set", () => {
      delete process.env.TMPDIR;
      // env resolution consumes "$TMPDIR" first; $TMPDIR replacement is for inline usage
      expect(resolveConfigString("$TMPDIR")).toBe("");
    });
  });

  describe("chained resolution", () => {
    it("resolves env var then applies tmpdir expansion on the result", () => {
      process.env.SYMPHONY_PATH = "/base/$TMPDIR/sub";
      process.env.TMPDIR = "/tmp";
      expect(resolveConfigString("$SYMPHONY_PATH")).toBe("/base//tmp/sub");
    });

    it("resolves home path then tmpdir in a chained value", () => {
      process.env.HOME = "/home/user";
      expect(resolveConfigString("~/workspace")).toBe(path.join("/home/user", "workspace"));
    });
  });

  describe("expandHomePath edge cases", () => {
    it("returns empty string for non-string input to expandHomePath (via resolveConfigString)", () => {
      // Non-string goes through resolveEnvBackedString -> "" -> expandHomePath("")
      expect(resolveConfigString(42)).toBe("");
      expect(resolveConfigString(null)).toBe("");
      expect(resolveConfigString(true)).toBe("");
    });

    it("resolvePathConfigString returns exactly empty string for non-string values (type guard)", () => {
      // This kills the mutant on resolvers.ts:86 where typeof !== "string" guard is removed
      // AND the mutant on resolvers.ts:46 where "" is changed to "Stryker was here!"
      // By testing resolvePathConfigString with non-string, we exercise the early return
      const result = resolvePathConfigString(42);
      expect(result).toBe("");
      expect(result.length).toBe(0);
    });
  });
});

describe("resolvePathConfigString", () => {
  it("returns empty string for non-string inputs", () => {
    expect(resolvePathConfigString(undefined)).toBe("");
    expect(resolvePathConfigString(null)).toBe("");
    expect(resolvePathConfigString(42)).toBe("");
  });

  it("returns empty string for boolean input", () => {
    expect(resolvePathConfigString(true)).toBe("");
    expect(resolvePathConfigString(false)).toBe("");
  });

  it("returns empty string for object input", () => {
    expect(resolvePathConfigString({})).toBe("");
    expect(resolvePathConfigString([])).toBe("");
  });

  it("expands all $VAR references within a path string", () => {
    process.env.SYMPHONY_BASE = "base";
    process.env.SYMPHONY_SUB = "sub";
    expect(resolvePathConfigString("/root/$SYMPHONY_BASE/$SYMPHONY_SUB/file")).toBe("/root/base/sub/file");
  });

  it("expands $TMPDIR inline within a path", () => {
    process.env.TMPDIR = "/custom/tmp";
    expect(resolvePathConfigString("/prefix/$TMPDIR/suffix")).toBe("/prefix//custom/tmp/suffix");
  });

  it("expands ~ and then remaining env vars in a path", () => {
    process.env.HOME = "/home/user";
    process.env.SYMPHONY_DIR = "proj";
    expect(resolvePathConfigString("~/$SYMPHONY_DIR/src")).toBe(path.join("/home/user", "proj/src"));
  });

  it("resolves secrets before path expansion", () => {
    const resolver = (name: string) => (name === "path-secret" ? "/secret/base/$SYMPHONY_EXTRA" : undefined);
    process.env.SYMPHONY_EXTRA = "extra";
    expect(resolvePathConfigString("$SECRET:path-secret", resolver)).toBe("/secret/base/extra");
  });

  it("replaces missing env vars with empty string in paths", () => {
    delete process.env.SYMPHONY_NOPE;
    expect(resolvePathConfigString("/a/$SYMPHONY_NOPE/b")).toBe("/a//b");
  });

  it("passes through a plain path without variables", () => {
    expect(resolvePathConfigString("/simple/path")).toBe("/simple/path");
  });
});
