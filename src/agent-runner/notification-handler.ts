import type { Issue, TokenUsageSnapshot } from "../core/types.js";
import { extractItemContent, extractTokenUsageSnapshot } from "./helpers.js";
import { asRecord, asString } from "./helpers.js";
import { sanitizeContent } from "../core/content-sanitizer.js";
import {
  appendReasoningText,
  composeSessionId,
  deleteReasoningBuffer,
  recordCompletedTurn,
  type TurnState,
} from "./turn-state.js";

interface AgentRunnerNotificationEvent {
  at: string;
  issueId: string;
  issueIdentifier: string;
  sessionId: string | null;
  event: string;
  message: string;
  usage?: TokenUsageSnapshot;
  usageMode?: "absolute_total" | "delta";
  content?: string | null;
}

export function handleNotification(input: {
  state: TurnState;
  notification: { method: string; params?: unknown };
  issue: Issue;
  threadId: string | null;
  turnId: string | null;
  onEvent: (event: AgentRunnerNotificationEvent) => void;
}): void {
  const params = asRecord(input.notification.params);
  if (input.notification.method === "turn/started") {
    const turn = asRecord(params.turn);
    const startedTurnId = asString(turn.id);
    input.onEvent({
      at: new Date().toISOString(),
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      sessionId: composeSessionId(input.threadId, startedTurnId ?? input.turnId),
      event: "turn_started",
      message: startedTurnId ? `turn ${startedTurnId} started` : "turn started",
    });
    return;
  }

  if (input.notification.method === "turn/completed") {
    const turn = asRecord(params.turn);
    recordCompletedTurn(input.state, asString(turn.id), params);
    return;
  }

  if (input.notification.method === "thread/tokenUsage/updated") {
    const turnId = asString(params.turnId);
    const tokenUsage = asRecord(params.tokenUsage);
    const total = extractTokenUsageSnapshot(tokenUsage.total);
    if (!total) {
      return;
    }
    input.onEvent({
      at: new Date().toISOString(),
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      sessionId: composeSessionId(input.threadId, turnId ?? input.turnId),
      event: "token_usage_updated",
      message: turnId ? `token usage updated for ${turnId}` : "token usage updated",
      usage: total,
      usageMode: "absolute_total",
    });
    return;
  }

  if (
    input.notification.method === "item/reasoning/summaryTextDelta" ||
    input.notification.method === "item/reasoning/textDelta"
  ) {
    const delta = asRecord(params.delta);
    appendReasoningText(input.state, asString(delta.id) ?? asString(params.itemId), asString(delta.text));
    return;
  }

  if (input.notification.method === "item/reasoning/summaryPartAdded") {
    const part = asRecord(params.part);
    appendReasoningText(input.state, asString(params.itemId), asString(part.text));
    return;
  }

  if (input.notification.method === "item/started" || input.notification.method === "item/completed") {
    const item = asRecord(params.item);
    const itemType = asString(item.type) ?? "item";
    const itemId = asString(item.id);
    const verb = input.notification.method.endsWith("started") ? "started" : "completed";

    const content = extractItemContent(itemType, itemId, item, verb, input.state.reasoningBuffers);
    if (verb === "completed") {
      deleteReasoningBuffer(input.state, itemId);
    }

    input.onEvent({
      at: new Date().toISOString(),
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      sessionId: composeSessionId(input.threadId, input.turnId),
      event: input.notification.method.replace("/", "_"),
      message: sanitizeContent(itemId ? `${itemType} ${itemId} ${verb}` : `${itemType} ${verb}`) || "item event",
      content,
    });
    return;
  }

  const level = asString(input.notification.method) ?? "unknown_method";
  input.onEvent({
    at: new Date().toISOString(),
    issueId: input.issue.id,
    issueIdentifier: input.issue.identifier,
    sessionId: composeSessionId(input.threadId, input.turnId),
    event: "other_message",
    message: sanitizeContent(level) || "other",
  });
}
