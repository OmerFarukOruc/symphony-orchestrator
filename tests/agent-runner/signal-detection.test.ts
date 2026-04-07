import { describe, expect, it } from "vitest";
import { detectStopSignal } from "../../src/core/signal-detection.js";

describe("detectStopSignal", () => {
  it("returns 'done' for RISOLUTO_STATUS: DONE", () => {
    expect(detectStopSignal("Task complete.\n\nRISOLUTO_STATUS: DONE")).toBe("done");
  });

  it("returns 'done' for RISOLUTO STATUS: DONE (without underscore)", () => {
    expect(detectStopSignal("RISOLUTO STATUS: DONE")).toBe("done");
  });

  it("returns 'blocked' for RISOLUTO_STATUS: BLOCKED", () => {
    expect(detectStopSignal("I am stuck.\n\nRISOLUTO_STATUS: BLOCKED")).toBe("blocked");
  });

  it("returns 'done' for legacy SYMPHONY_STATUS: DONE", () => {
    expect(detectStopSignal("Task complete.\n\nSYMPHONY_STATUS: DONE")).toBe("done");
  });

  it("returns 'blocked' for legacy SYMPHONY_STATUS: BLOCKED", () => {
    expect(detectStopSignal("I am stuck.\n\nSYMPHONY_STATUS: BLOCKED")).toBe("blocked");
  });

  it("returns null for content without a signal", () => {
    expect(detectStopSignal("I made some progress on the issue.")).toBeNull();
  });

  it("returns null for null content", () => {
    expect(detectStopSignal(null)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(detectStopSignal("risoluto_status: done")).toBe("done");
    expect(detectStopSignal("Risoluto_Status: Done")).toBe("done");
  });

  it("handles extra whitespace", () => {
    expect(detectStopSignal("RISOLUTO_STATUS:   DONE")).toBe("done");
  });

  it("detects DONE embedded in longer message", () => {
    const longMessage =
      "NIN-10 is complete. CHANGELOG.md has been added.\n\n" +
      "There is no further in-scope work.\n\n" +
      "RISOLUTO_STATUS: DONE";
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
      expect(detectStopSignal("{bad json RISOLUTO_STATUS: DONE")).toBe("done");
    });

    it("falls through to text matching for JSON without status field", () => {
      expect(detectStopSignal('{"result":"ok"}\nRISOLUTO_STATUS: BLOCKED')).toBe("blocked");
    });

    it("returns null for valid JSON values without an object status field", () => {
      expect(detectStopSignal("null")).toBeNull();
      expect(detectStopSignal("42")).toBeNull();
      expect(detectStopSignal('"done"')).toBeNull();
      expect(detectStopSignal("[]")).toBeNull();
      expect(detectStopSignal("{}")).toBeNull();
    });

    it("accepts whitespace-padded JSON with a status field", () => {
      expect(detectStopSignal(' \n {"status":"DONE","summary":"completed"} \t')).toBe("done");
      expect(detectStopSignal('\n\t{"status":"blocked"}   ')).toBe("blocked");
    });
  });
});
