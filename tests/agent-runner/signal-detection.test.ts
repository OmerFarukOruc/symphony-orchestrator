import { describe, expect, it } from "vitest";
import { detectStopSignal } from "../../src/agent-runner/signal-detection.js";

describe("detectStopSignal", () => {
  it("returns 'done' for SYMPHONY_STATUS: DONE", () => {
    expect(detectStopSignal("Task complete.\n\nSYMPHONY_STATUS: DONE")).toBe("done");
  });

  it("returns 'done' for SYMPHONY STATUS: DONE (without underscore)", () => {
    expect(detectStopSignal("SYMPHONY STATUS: DONE")).toBe("done");
  });

  it("returns 'blocked' for SYMPHONY_STATUS: BLOCKED", () => {
    expect(detectStopSignal("I am stuck.\n\nSYMPHONY_STATUS: BLOCKED")).toBe("blocked");
  });

  it("returns null for content without a signal", () => {
    expect(detectStopSignal("I made some progress on the issue.")).toBeNull();
  });

  it("returns null for null content", () => {
    expect(detectStopSignal(null)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(detectStopSignal("symphony_status: done")).toBe("done");
    expect(detectStopSignal("Symphony_Status: Done")).toBe("done");
  });

  it("handles extra whitespace", () => {
    expect(detectStopSignal("SYMPHONY_STATUS:   DONE")).toBe("done");
  });

  it("detects DONE embedded in longer message", () => {
    const longMessage =
      "NIN-10 is complete. CHANGELOG.md has been added.\n\n" +
      "There is no further in-scope work.\n\n" +
      "SYMPHONY_STATUS: DONE";
    expect(detectStopSignal(longMessage)).toBe("done");
  });
});
