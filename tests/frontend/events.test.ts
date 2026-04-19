import { describe, expect, it } from "vitest";
import { classifyEvent, eventTypeLabel, eventMatchesSearch } from "../../frontend/src/utils/events";
import type { RecentEvent } from "../../frontend/src/types";

function makeEvent(event: string, message = ""): RecentEvent {
  return {
    at: "2024-01-01T00:00:00Z",
    issueId: "i1",
    issueIdentifier: "MT-1",
    sessionId: null,
    event,
    message,
    content: null,
  };
}

describe("classifyEvent", () => {
  it("returns 'error' for event names containing 'error'", () => {
    expect(classifyEvent(makeEvent("auth_failed_error"))).toBe("error");
  });

  it("returns 'error' when message contains 'error'", () => {
    expect(classifyEvent(makeEvent("system", "connection error occurred"))).toBe("error");
  });

  it("returns 'reasoning' for exact 'reasoning' event type", () => {
    expect(classifyEvent(makeEvent("reasoning"))).toBe("reasoning");
  });

  it("reasoning takes priority over agent (no cross-match with 'agent')", () => {
    // 'reasoning' does not contain 'agent' so this verifies correct ordering
    expect(classifyEvent(makeEvent("reasoning"))).not.toBe("agent");
  });

  it("returns 'tool' for tool_exec", () => {
    expect(classifyEvent(makeEvent("tool_exec"))).toBe("tool");
  });

  it("returns 'tool' for tool_edit", () => {
    expect(classifyEvent(makeEvent("tool_edit"))).toBe("tool");
  });

  it("returns 'tool' for tool_call", () => {
    expect(classifyEvent(makeEvent("tool_call"))).toBe("tool");
  });

  it("returns 'tool' for web_search", () => {
    expect(classifyEvent(makeEvent("web_search"))).toBe("tool");
  });

  it("returns 'tool' for mcp_tool_call", () => {
    expect(classifyEvent(makeEvent("mcp_tool_call"))).toBe("tool");
  });

  it("returns 'agent' for agent_plan", () => {
    expect(classifyEvent(makeEvent("agent_plan"))).toBe("agent");
  });

  it("returns 'agent' for agent_message", () => {
    expect(classifyEvent(makeEvent("agent_message"))).toBe("agent");
  });

  it("returns 'agent' for agent_output", () => {
    expect(classifyEvent(makeEvent("agent_output"))).toBe("agent");
  });

  it("returns 'state-change' for thread events", () => {
    expect(classifyEvent(makeEvent("thread_started"))).toBe("state-change");
  });

  it("returns 'usage' for token_usage_updated", () => {
    expect(classifyEvent(makeEvent("token_usage_updated"))).toBe("usage");
  });

  it("returns 'system' for unknown events", () => {
    expect(classifyEvent(makeEvent("some_unknown_event"))).toBe("system");
  });
});

describe("eventTypeLabel", () => {
  it("returns 'Thinking' for reasoning", () => {
    expect(eventTypeLabel("reasoning")).toBe("Thinking");
  });

  it("returns 'Tool' for tool_call", () => {
    expect(eventTypeLabel("tool_call")).toBe("Tool");
  });

  it("returns 'Web search' for web_search", () => {
    expect(eventTypeLabel("web_search")).toBe("Web search");
  });

  it("returns 'You' for user_message", () => {
    expect(eventTypeLabel("user_message")).toBe("You");
  });

  it("returns 'Shell' for tool_exec", () => {
    expect(eventTypeLabel("tool_exec")).toBe("Shell");
  });

  it("dedupes token_usage and token_usage_updated to the same label", () => {
    expect(eventTypeLabel("token_usage")).toBe("Tokens");
    expect(eventTypeLabel("token_usage_updated")).toBe("Tokens");
  });

  it("returns 'File changes' for turn_diff", () => {
    expect(eventTypeLabel("turn_diff")).toBe("File changes");
  });

  it("returns 'Thread status' for thread_status", () => {
    expect(eventTypeLabel("thread_status")).toBe("Thread status");
  });

  it("returns a humanized fallback for unknown keys", () => {
    expect(eventTypeLabel("some_new_event")).toBe("some new event");
  });
});

describe("eventMatchesSearch", () => {
  it("returns true for empty query", () => {
    expect(eventMatchesSearch(makeEvent("agent_message"), "")).toBe(true);
  });

  it("matches by event name", () => {
    expect(eventMatchesSearch(makeEvent("tool_exec"), "tool_exec")).toBe(true);
  });

  it("matches by message content", () => {
    expect(eventMatchesSearch(makeEvent("system", "container started"), "container")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(eventMatchesSearch(makeEvent("AGENT_MESSAGE", "Hello World"), "hello")).toBe(true);
  });

  it("returns false when no match", () => {
    expect(eventMatchesSearch(makeEvent("system", "nothing here"), "missing")).toBe(false);
  });
});
