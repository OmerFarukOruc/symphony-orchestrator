import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

import { handleNotification } from "../../src/agent-runner/notification-handler.js";
import { createTurnState, type TurnState } from "../../src/agent-runner/turn-state.js";
import { createIssue } from "../orchestrator/issue-test-factories.js";

const FIXED_ISO = "2024-01-01T00:00:00.000Z";

interface CapturedEvent {
  at: string;
  issueId: string;
  issueIdentifier: string;
  sessionId: string | null;
  event: string;
  message: string;
  usage?: unknown;
  usageMode?: string;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
}

describe("handleNotification", () => {
  let state: TurnState;
  let events: CapturedEvent[];
  let onEvent: (event: CapturedEvent) => void;
  const issue = createIssue({ identifier: "ENG-42", priority: null, createdAt: null, updatedAt: null });

  beforeEach(() => {
    state = createTurnState();
    events = [];
    onEvent = (event) => events.push(event);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_ISO));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("turn/started", () => {
    it("emits turn_started with the turn id from params", () => {
      handleNotification({
        state,
        notification: { method: "turn/started", params: { turn: { id: "turn-abc" } } },
        issue,
        threadId: "thread-1",
        turnId: "turn-old",
        onEvent,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        at: FIXED_ISO,
        issueId: "issue-1",
        issueIdentifier: "ENG-42",
        sessionId: "thread-1-turn-abc",
        event: "turn_started",
        message: "turn turn-abc started",
      });
    });

    it("falls back to turnId when turn.id is absent", () => {
      handleNotification({
        state,
        notification: { method: "turn/started", params: { turn: {} } },
        issue,
        threadId: "thread-1",
        turnId: "turn-fallback",
        onEvent,
      });

      expect(events[0]).toMatchObject({
        sessionId: "thread-1-turn-fallback",
        message: "turn started",
      });
    });
  });

  describe("turn/completed", () => {
    it("records a completed turn in state", () => {
      const resolver = vi.fn();
      state.turnCompletionResolvers.set("turn-done", resolver);

      handleNotification({
        state,
        notification: { method: "turn/completed", params: { turn: { id: "turn-done" } } },
        issue,
        threadId: "thread-1",
        turnId: "turn-done",
        onEvent,
      });

      expect(resolver).toHaveBeenCalled();
      expect(events).toHaveLength(0);
    });

    it("buffers turn completion when no resolver is waiting", () => {
      handleNotification({
        state,
        notification: { method: "turn/completed", params: { turn: { id: "turn-later" } } },
        issue,
        threadId: "thread-1",
        turnId: null,
        onEvent,
      });

      expect(state.completedTurnNotifications.has("turn-later")).toBe(true);
    });
  });

  describe("thread/tokenUsage/updated", () => {
    it("emits token_usage_updated with snapshot from total", () => {
      handleNotification({
        state,
        notification: {
          method: "thread/tokenUsage/updated",
          params: {
            turnId: "turn-tok",
            tokenUsage: {
              total: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
            },
          },
        },
        issue,
        threadId: "thread-1",
        turnId: null,
        onEvent,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: "token_usage_updated",
        sessionId: "thread-1-turn-tok",
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
        usageMode: "absolute_total",
      });
    });

    it("is a no-op when total is missing valid token fields", () => {
      handleNotification({
        state,
        notification: {
          method: "thread/tokenUsage/updated",
          params: { turnId: "t", tokenUsage: { total: { inputTokens: "bad" } } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events).toHaveLength(0);
    });

    it("falls back to turnId when params.turnId is absent", () => {
      handleNotification({
        state,
        notification: {
          method: "thread/tokenUsage/updated",
          params: { tokenUsage: { total: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } } },
        },
        issue,
        threadId: "thread-1",
        turnId: "fallback-turn",
        onEvent,
      });

      expect(events[0]).toMatchObject({
        sessionId: "thread-1-fallback-turn",
        message: "token usage updated",
      });
    });
  });

  describe("item/reasoning/summaryTextDelta", () => {
    it("appends reasoning text to the buffer by delta.id", () => {
      handleNotification({
        state,
        notification: {
          method: "item/reasoning/summaryTextDelta",
          params: { delta: { id: "r-1", text: "thinking" } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(state.reasoningBuffers.get("r-1")).toBe("thinking");
    });

    it("falls back to params.itemId when delta.id is absent", () => {
      handleNotification({
        state,
        notification: {
          method: "item/reasoning/textDelta",
          params: { itemId: "r-2", delta: { text: "more" } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(state.reasoningBuffers.get("r-2")).toBe("more");
    });
  });

  describe("item/reasoning/summaryPartAdded", () => {
    it("appends reasoning text from part.text", () => {
      handleNotification({
        state,
        notification: {
          method: "item/reasoning/summaryPartAdded",
          params: { itemId: "r-3", part: { text: "summary chunk" } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(state.reasoningBuffers.get("r-3")).toBe("summary chunk");
    });
  });

  describe("item/started", () => {
    it("emits an event with item type and id", () => {
      handleNotification({
        state,
        notification: {
          method: "item/started",
          params: { item: { type: "commandExecution", id: "cmd-1", command: "ls -la" } },
        },
        issue,
        threadId: "thread-1",
        turnId: "turn-1",
        onEvent,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: "tool_exec",
        message: "commandExecution cmd-1 started",
        content: "ls -la",
        metadata: { itemType: "commandExecution", verb: "started" },
      });
    });

    it.each([
      ["agentMessage", "agent_message"],
      ["fileChange", "tool_edit"],
      ["dynamicToolCall", "tool_call"],
      ["webSearch", "web_search"],
      ["userMessage", "user_message"],
      ["unknownType", "item_started"],
    ])("maps item type %s → event %s for item/started", (itemType, expectedEvent) => {
      handleNotification({
        state,
        notification: {
          method: "item/started",
          params: { item: { type: itemType, id: "x-1" } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });
      expect(events[0]).toMatchObject({ event: expectedEvent, metadata: { itemType, verb: "started" } });
    });
  });

  describe("item/completed", () => {
    it("emits an event and clears reasoning buffer", () => {
      state.reasoningBuffers.set("reason-item", "accumulated reasoning");

      handleNotification({
        state,
        notification: {
          method: "item/completed",
          params: { item: { type: "reasoning", id: "reason-item" } },
        },
        issue,
        threadId: "thread-1",
        turnId: "turn-1",
        onEvent,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: "reasoning",
        message: "reasoning reason-item completed",
        content: "accumulated reasoning",
        metadata: { itemType: "reasoning", verb: "completed" },
      });
      expect(state.reasoningBuffers.has("reason-item")).toBe(false);
    });

    it("sets isDiff: true metadata for completed fileChange items", () => {
      handleNotification({
        state,
        notification: {
          method: "item/completed",
          params: { item: { type: "fileChange", id: "fc-1" } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events[0]).toMatchObject({
        event: "tool_edit",
        metadata: { itemType: "fileChange", verb: "completed", isDiff: true },
      });
    });

    it("does NOT set isDiff: true for non-fileChange completed items", () => {
      handleNotification({
        state,
        notification: {
          method: "item/completed",
          params: { item: { type: "agentMessage", id: "msg-1" } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events[0].metadata).not.toHaveProperty("isDiff");
    });

    it("uses 'item' as fallback type when item.type is absent", () => {
      handleNotification({
        state,
        notification: {
          method: "item/completed",
          params: { item: {} },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events[0]).toMatchObject({
        message: "item completed",
      });
    });
  });

  describe("codex notification mapping", () => {
    it.each([
      ["codex/event/task_started", "agent_started", "Agent started working"],
      ["codex/event/task_complete", "agent_complete", "Agent completed work"],
      ["codex/event/item_started", "step_started", "Agent began a step"],
      ["codex/event/item_completed", "step_completed", "Agent finished a step"],
      ["codex/event/agent_message", "agent_message", "Agent sent a message"],
      ["codex/event/agent_message_delta", "agent_streaming", "Agent streaming text"],
      ["codex/event/agent_message_content_delta", "agent_streaming", "Agent streaming text"],
      ["codex/event/token_count", "token_usage", "Token usage updated"],
      ["codex/event/turn_diff", "turn_diff", "Turn diff computed"],
      ["codex/event/exec_command_begin", "tool_exec", "Running shell command"],
      ["codex/event/exec_command_end", "tool_exec", "Shell command finished"],
      ["codex/event/exec_command_output_delta", "tool_output", "Command output streaming"],
      ["codex/event/patch_apply_begin", "tool_edit", "Applying file changes"],
      ["codex/event/patch_apply_end", "tool_edit", "File changes applied"],
      ["codex/event/mcp_startup_complete", "system", "MCP tools initialized"],
      ["thread/started", "thread_started", "Thread session opened"],
      ["thread/status/changed", "thread_status", "Thread status changed"],
      ["account/rateLimits/updated", "rate_limits", "API rate limits updated"],
      ["item/agentMessage/delta", "agent_streaming", "Agent streaming text"],
      ["item/fileChange/outputDelta", "tool_output", "File change output streaming"],
      ["item/commandExecution/outputDelta", "tool_output", "Command output streaming"],
    ])("maps %s to event=%s, message=%s", (method, expectedEvent, expectedMessage) => {
      handleNotification({
        state,
        notification: { method, params: {} },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: expectedEvent,
        message: expectedMessage,
      });
    });
  });

  describe("fallback for unknown methods", () => {
    it("uses params.message when available", () => {
      handleNotification({
        state,
        notification: { method: "some/unknown/method", params: { message: "custom output" } },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events[0]).toMatchObject({
        event: "agent_output",
        message: "custom output",
      });
    });

    it("uses params.text as second fallback", () => {
      handleNotification({
        state,
        notification: { method: "some/unknown/method", params: { text: "text output" } },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events[0]).toMatchObject({
        event: "agent_output",
        message: "text output",
      });
    });

    it("uses params.description as third fallback", () => {
      handleNotification({
        state,
        notification: { method: "some/unknown/method", params: { description: "desc output" } },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events[0]).toMatchObject({
        event: "agent_output",
        message: "desc output",
      });
    });

    it("returns method as event=other when no message fields exist", () => {
      handleNotification({
        state,
        notification: { method: "completely/unknown", params: {} },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events[0]).toMatchObject({
        event: "other",
        message: "completely/unknown",
      });
    });

    it("handles missing params gracefully", () => {
      handleNotification({
        state,
        notification: { method: "no/params" },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: "other",
        message: "no/params",
      });
    });
  });

  describe("turn/diff/updated", () => {
    it("emits turn_diff event with diff content and isDiff metadata", () => {
      const diff = "diff --git a/src/foo.ts b/src/foo.ts\n+added line\n-removed line";
      handleNotification({
        state,
        notification: {
          method: "turn/diff/updated",
          params: { threadId: "thread-1", turnId: "turn-1", diff },
        },
        issue,
        threadId: "thread-1",
        turnId: "turn-1",
        onEvent,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: "turn_diff",
        message: "Turn diff updated",
        content: diff,
        metadata: { isDiff: true },
      });
    });

    it("emits nothing when diff param is absent", () => {
      handleNotification({
        state,
        notification: {
          method: "turn/diff/updated",
          params: { threadId: "thread-1", turnId: "turn-1" },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events).toHaveLength(0);
    });
  });

  describe("item/plan/delta", () => {
    it("accumulates plan text into the reasoning buffer via delta.text", () => {
      handleNotification({
        state,
        notification: {
          method: "item/plan/delta",
          params: { itemId: "plan-1", delta: { text: "Step 1: " } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });
      handleNotification({
        state,
        notification: {
          method: "item/plan/delta",
          params: { itemId: "plan-1", delta: { text: "analyse the codebase" } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(state.reasoningBuffers.get("plan-1")).toBe("Step 1: analyse the codebase");
      expect(events).toHaveLength(0); // deltas do not emit events
    });
  });

  describe("turn/plan/updated", () => {
    it("emits agent_plan with JSON-stringified steps", () => {
      const steps = [{ title: "Step 1", status: "completed" }];
      handleNotification({
        state,
        notification: {
          method: "turn/plan/updated",
          params: { plan: { steps } },
        },
        issue,
        threadId: "thread-1",
        turnId: "turn-1",
        onEvent,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        at: FIXED_ISO,
        issueId: "issue-1",
        issueIdentifier: "ENG-42",
        sessionId: "thread-1-turn-1",
        event: "agent_plan",
        message: "Agent plan updated",
        metadata: { isPlan: true },
      });
      expect(events[0].content).toBe(JSON.stringify(steps));
    });

    it("passes string steps through directly", () => {
      handleNotification({
        state,
        notification: {
          method: "turn/plan/updated",
          params: { plan: { steps: "1. Clone repo\n2. Run tests" } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events[0]).toMatchObject({
        event: "agent_plan",
        content: "1. Clone repo\n2. Run tests",
      });
    });

    it("does not crash with empty plan params", () => {
      handleNotification({
        state,
        notification: {
          method: "turn/plan/updated",
          params: {},
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: "agent_plan",
        message: "Agent plan updated",
        metadata: { isPlan: true },
      });
    });
  });

  describe("item/commandExecution/outputDelta", () => {
    it("maps to tool_output via the label fallback path", () => {
      handleNotification({
        state,
        notification: {
          method: "item/commandExecution/outputDelta",
          params: { delta: { text: "output chunk" } },
        },
        issue,
        threadId: "thread-1",
        turnId: "turn-1",
        onEvent,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: "tool_output",
        message: "Command output streaming",
      });
    });
  });

  describe("item type mapping completeness", () => {
    it.each([
      ["plan", "agent_plan"],
      ["mcpToolCall", "mcp_tool_call"],
      ["contextCompaction", "context_compaction"],
      ["imageView", "image_view"],
    ])("maps item type %s → event %s", (itemType, expectedEvent) => {
      handleNotification({
        state,
        notification: {
          method: "item/completed",
          params: { item: { type: itemType, id: "x-1" } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });
      expect(events[0]).toMatchObject({ event: expectedEvent });
    });

    it("emits plan content from item.text when plan item completes", () => {
      const planText = "1. Clone the repo\n2. Run tests\n3. Open PR";
      handleNotification({
        state,
        notification: {
          method: "item/completed",
          params: { item: { type: "plan", id: "plan-1", text: planText } },
        },
        issue,
        threadId: null,
        turnId: null,
        onEvent,
      });

      expect(events[0]).toMatchObject({
        event: "agent_plan",
        content: planText,
      });
    });
  });
});
