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
});

describe("resolvePathConfigString", () => {
  it("returns empty string for non-string inputs", () => {
    expect(resolvePathConfigString(undefined)).toBe("");
    expect(resolvePathConfigString(null)).toBe("");
    expect(resolvePathConfigString(42)).toBe("");
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
});
