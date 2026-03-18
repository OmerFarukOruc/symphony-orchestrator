import type { Issue, TokenUsageSnapshot } from "../core/types.js";
import { asRecord, asString, extractItemContent, extractTokenUsageSnapshot } from "./helpers.js";
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

function handleTurnStarted(input: NotificationInput, params: Record<string, unknown>): void {
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
}

function handleTurnCompleted(input: NotificationInput, params: Record<string, unknown>): void {
  const turn = asRecord(params.turn);
  recordCompletedTurn(input.state, asString(turn.id), params);
}

function handleTokenUsageUpdated(input: NotificationInput, params: Record<string, unknown>): void {
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
}

function handleReasoningDelta(input: NotificationInput, params: Record<string, unknown>): void {
  const delta = asRecord(params.delta);
  appendReasoningText(input.state, asString(delta.id) ?? asString(params.itemId), asString(delta.text));
}

function handleReasoningPartAdded(input: NotificationInput, params: Record<string, unknown>): void {
  const part = asRecord(params.part);
  appendReasoningText(input.state, asString(params.itemId), asString(part.text));
}

function handleItemEvent(
  input: NotificationInput,
  params: Record<string, unknown>,
  verb: "started" | "completed",
): void {
  const item = asRecord(params.item);
  const itemType = asString(item.type) ?? "item";
  const itemId = asString(item.id);

  const content = extractItemContent(itemType, itemId, item, verb, input.state.reasoningBuffers);
  if (verb === "completed") {
    deleteReasoningBuffer(input.state, itemId);
  }

  input.onEvent({
    at: new Date().toISOString(),
    issueId: input.issue.id,
    issueIdentifier: input.issue.identifier,
    sessionId: composeSessionId(input.threadId, input.turnId),
    event: input.notification.method.replaceAll("/", "_"),
    message: sanitizeContent(itemId ? `${itemType} ${itemId} ${verb}` : `${itemType} ${verb}`) || "item event",
    content,
  });
}

interface NotificationInput {
  state: TurnState;
  notification: { method: string; params?: unknown };
  issue: Issue;
  threadId: string | null;
  turnId: string | null;
  onEvent: (event: AgentRunnerNotificationEvent) => void;
}

const methodHandlers: Record<string, (input: NotificationInput, params: Record<string, unknown>) => void> = {
  "turn/started": handleTurnStarted,
  "turn/completed": handleTurnCompleted,
  "thread/tokenUsage/updated": handleTokenUsageUpdated,
  "item/reasoning/summaryTextDelta": handleReasoningDelta,
  "item/reasoning/textDelta": handleReasoningDelta,
  "item/reasoning/summaryPartAdded": handleReasoningPartAdded,
};

export function handleNotification(input: NotificationInput): void {
  const params = asRecord(input.notification.params);
  const method = input.notification.method;

  const handler = methodHandlers[method];
  if (handler) {
    handler(input, params);
    return;
  }

  if (method === "item/started" || method === "item/completed") {
    const verb = method.endsWith("started") ? "started" : "completed";
    handleItemEvent(input, params, verb);
    return;
  }

  const level = asString(method) ?? "unknown_method";
  input.onEvent({
    at: new Date().toISOString(),
    issueId: input.issue.id,
    issueIdentifier: input.issue.identifier,
    sessionId: composeSessionId(input.threadId, input.turnId),
    event: "other_message",
    message: sanitizeContent(level) || "other",
  });
}
