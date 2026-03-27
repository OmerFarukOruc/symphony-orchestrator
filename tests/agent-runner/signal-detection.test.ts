import { describe, expect, it } from "vitest";
import { detectStopSignal } from "../../src/core/signal-detection.js";

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

  describe("structured JSON output", () => {
    it("returns 'done' for JSON with status DONE", () => {
      expect(detectStopSignal('{"status":"DONE","summary":"completed"}')).toBe("done");
    });

    it("returns 'blocked' for JSON with status BLOCKED", () => {
      expect(detectStopSignal('{"status":"BLOCKED","summary":"stuck"}')).toBe("blocked");
    });

    it("returns null for JSON with status CONTINUE", () => {
      expect(detectStopSignal('{"status":"CONTINUE","summary":"working"}')).toBeNull();
    });

    it("is case-insensitive for JSON status", () => {
      expect(detectStopSignal('{"status":"done"}')).toBe("done");
      expect(detectStopSignal('{"status":"Done"}')).toBe("done");
      expect(detectStopSignal('{"status":"blocked"}')).toBe("blocked");
    });

    it("falls through to text matching for malformed JSON", () => {
      expect(detectStopSignal("{bad json SYMPHONY_STATUS: DONE")).toBe("done");
    });

    it("falls through to text matching for JSON without status field", () => {
      expect(detectStopSignal('{"result":"ok"}\nSYMPHONY_STATUS: BLOCKED')).toBe("blocked");
    });
  });
});
