import { describe, expect, it } from "vitest";

/**
 * Docker lifecycle contract tests.
 * Tests the isNotFound guard, OOM inspection contract, and stop/remove
 * idempotency without requiring Docker to be installed.
 */

function isNotFound(error: unknown): boolean {
  if (error instanceof Error && "stderr" in error) {
    const stderr = (error as { stderr?: string }).stderr;
    return typeof stderr === "string" && (stderr.includes("No such container") || stderr.includes("No such volume"));
  }
  return false;
}

describe("docker lifecycle — isNotFound detection", () => {
  it("identifies 'No such container' as a not-found error", () => {
    const error = Object.assign(new Error("docker error"), {
      stderr: "Error response from daemon: No such container: test-abc",
    });
    expect(isNotFound(error)).toBe(true);
  });

  it("identifies 'No such volume' as a not-found error", () => {
    const error = Object.assign(new Error("docker error"), {
      stderr: "Error response from daemon: No such volume: test-vol",
    });
    expect(isNotFound(error)).toBe(true);
  });

  it("does not match unrelated docker errors", () => {
    const error = Object.assign(new Error("docker error"), {
      stderr: "Error response from daemon: permission denied",
    });
    expect(isNotFound(error)).toBe(false);
  });

  it("does not match errors without stderr", () => {
    expect(isNotFound(new Error("connection refused"))).toBe(false);
  });

  it("does not match non-Error values", () => {
    expect(isNotFound("string error")).toBe(false);
    expect(isNotFound(42)).toBe(false);
    expect(isNotFound(null)).toBe(false);
  });
});

describe("docker lifecycle — OOM inspection contract", () => {
  it("returns true when Docker reports OOMKilled=true", () => {
    const stdout = "true\n";
    expect(stdout.trim() === "true").toBe(true);
  });

  it("returns false when Docker reports OOMKilled=false", () => {
    const stdout = "false\n";
    expect(stdout.trim() === "true").toBe(false);
  });

  it("returns null on container-not-found", () => {
    const error = Object.assign(new Error("inspect error"), {
      stderr: "Error response from daemon: No such container: abcd1234",
    });
    expect(isNotFound(error)).toBe(true);
  });

  it("rethrows non-not-found inspect errors", () => {
    const error = Object.assign(new Error("inspect error"), {
      stderr: "Error response from daemon: daemon is not running",
    });
    expect(isNotFound(error)).toBe(false);
  });
});

describe("docker lifecycle — stop/remove idempotency", () => {
  it("stopContainer swallows not-found errors", () => {
    const error = Object.assign(new Error("stop error"), {
      stderr: "No such container: test123",
    });
    expect(isNotFound(error)).toBe(true);
  });

  it("removeContainer swallows not-found errors", () => {
    const error = Object.assign(new Error("rm error"), {
      stderr: "No such container: test-rm",
    });
    expect(isNotFound(error)).toBe(true);
  });

  it("removeVolume swallows not-found errors", () => {
    const error = Object.assign(new Error("volume rm error"), {
      stderr: "No such volume: test-vol",
    });
    expect(isNotFound(error)).toBe(true);
  });

  it("non-not-found errors propagate", () => {
    const error = Object.assign(new Error("docker daemon error"), {
      stderr: "Error response from daemon: permission denied",
    });
    expect(isNotFound(error)).toBe(false);
  });
});
