import { describe, expect, it } from "vitest";

import {
  buildQuestionPrompt,
  capabilityCounts,
  normalizeCollaborationModes,
} from "../../frontend/src/views/codex-admin/codex-admin-helpers";

describe("settings codex admin helpers", () => {
  it("counts supported, unsupported, and unknown capabilities", () => {
    const counts = capabilityCounts({
      connectedAt: "2026-04-08T11:00:00Z",
      initializationError: null,
      methods: {
        "thread/list": "supported",
        "thread/read": "unsupported",
        "mcpServerStatus/list": "unknown",
        "model/list": "supported",
      },
      notifications: { "app/list/updated": "enabled" },
    });

    expect(counts).toEqual({ supported: 2, unsupported: 1, unknown: 1 });
  });

  it("normalizes collaboration mode responses from either response shape", () => {
    expect(
      normalizeCollaborationModes([
        { name: "default", displayName: "Default" },
        { name: "review", displayName: "Review" },
      ]),
    ).toEqual([
      { name: "default", displayName: "Default" },
      { name: "review", displayName: "Review" },
    ]);

    expect(
      normalizeCollaborationModes({
        data: [{ name: "default", displayName: "Default" }],
      }),
    ).toEqual([{ name: "default", displayName: "Default" }]);

    expect(normalizeCollaborationModes({})).toEqual([]);
  });

  it("builds a prompt string with header, question, and numbered options", () => {
    const prompt = buildQuestionPrompt({
      id: "choice",
      header: "Pick a deployment mode",
      question: "Which deployment mode should Codex use?",
      options: [{ label: "Safe", description: "Read-only until approved" }, { label: "Fast" }],
    });

    expect(prompt).toBe(
      [
        "Pick a deployment mode",
        "Which deployment mode should Codex use?",
        "",
        "1. Safe — Read-only until approved",
        "2. Fast",
      ].join("\n"),
    );
  });

  it("falls back to the question text when no header exists", () => {
    expect(
      buildQuestionPrompt({
        id: "name",
        question: "What should we call this thread?",
      }),
    ).toBe("What should we call this thread?");
  });
});
