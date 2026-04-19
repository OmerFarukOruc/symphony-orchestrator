import type { RecentEvent } from "../../types/runtime.js";

export type StepKind =
  | "reasoning"
  | "agent_message"
  | "agent_message_partial"
  | "tool_exec"
  | "tool_edit"
  | "tool_call"
  | "mcp_tool_call"
  | "web_search"
  | "image_view"
  | "user_message"
  | "user_input_requested"
  | "tool_approval_granted"
  | "agent_plan"
  | "error"
  | "context_compaction"
  | "telemetry"
  | "other";

export interface StepNode {
  kind: StepKind;
  event: RecentEvent;
  /** Merged completion event when present. */
  completedEvent: RecentEvent | null;
  /** Correlation id when available (itemId or synthesized). */
  correlationId: string | null;
  /** Duration in ms when paired started+completed events are merged. */
  durationMs: number | null;
  /** True when a started event has no matching completion yet. */
  active: boolean;
  /** Associated output chunks (tool_output_live / tool_output) for this step. */
  outputDeltas: RecentEvent[];
  /** True when the reducer emitted a time-gap marker before this step. */
  timeGap: boolean;
}

export interface TurnBlock {
  turnId: string | null;
  sessionId: string | null;
  steps: StepNode[];
  startedAt: string;
  completedAt: string | null;
  tokenIn: number;
  tokenOut: number;
  /** Raw events carried for the filter/detail panel. */
  events: RecentEvent[];
}

export interface PreambleBlock {
  events: RecentEvent[];
  startedAt: string | null;
  endedAt: string | null;
}

export interface LiveStateBanner {
  copy: string;
  elapsedStartedAt: string | null;
  level: "info" | "warning" | "error" | "success";
}

export interface RenderedTimeline {
  preamble: PreambleBlock;
  turns: TurnBlock[];
  activeBanner: LiveStateBanner | null;
  /** Fallback flat events (for filter/copy paths). */
  rawEvents: RecentEvent[];
}

const TIME_GAP_MS = 60_000;

const PREAMBLE_EVENTS: ReadonlySet<string> = new Set([
  "container_starting",
  "container_running",
  "container_failed",
  "codex_initializing",
  "codex_config_loaded",
  "codex_requirements_loaded",
  "thread_loaded",
  "thread_started",
  "workspace_preparing",
  "workspace_ready",
  "workspace_failed",
]);

/**
 * High-volume, low-signal events that still belong to a turn but should render
 * with a muted style. They are NOT dropped — every event must remain visible
 * so the filter-chip counts match what the user can actually see.
 */
const TELEMETRY_EVENTS: ReadonlySet<string> = new Set([
  "container_stats",
  "token_usage",
  "token_usage_updated",
  "rate_limits",
  "rate_limits_updated",
  "thread_status",
  "turn_diff",
]);

export function isTelemetryEvent(kind: string): boolean {
  return TELEMETRY_EVENTS.has(kind);
}

const STEP_KIND_MAP: Record<string, StepKind> = {
  reasoning: "reasoning",
  reasoning_delta: "reasoning",
  agent_message: "agent_message",
  agent_output: "agent_message",
  agent_message_partial: "agent_message_partial",
  agent_streaming: "agent_message_partial",
  agent_plan: "agent_plan",
  tool_exec: "tool_exec",
  tool_edit: "tool_edit",
  tool_call: "tool_call",
  mcp_tool_call: "mcp_tool_call",
  web_search: "web_search",
  image_view: "image_view",
  user_message: "user_message",
  user_input_requested: "user_input_requested",
  tool_approval_granted: "tool_approval_granted",
  context_compaction: "context_compaction",
};

function eventKind(event: RecentEvent): string {
  return typeof event.event === "string" ? event.event : "";
}

function eventMessage(event: RecentEvent): string {
  return typeof event.message === "string" ? event.message : "";
}

function eventSessionId(event: RecentEvent): string | null {
  return typeof event.session_id === "string" ? event.session_id : null;
}

function eventTimestamp(event: RecentEvent): string {
  return typeof event.at === "string" ? event.at : new Date().toISOString();
}

function classifyStep(event: RecentEvent): StepKind {
  const type = eventKind(event).toLowerCase();
  if (type.includes("error") || eventMessage(event).toLowerCase().includes("error")) {
    return "error";
  }
  if (TELEMETRY_EVENTS.has(type)) {
    return "telemetry";
  }
  return STEP_KIND_MAP[type] ?? "other";
}

function isPreamble(event: RecentEvent): boolean {
  const sessionId = eventSessionId(event);
  if (sessionId !== null && sessionId.includes("-")) {
    return false;
  }
  return PREAMBLE_EVENTS.has(eventKind(event));
}

function isTelemetry(event: RecentEvent): boolean {
  return TELEMETRY_EVENTS.has(eventKind(event));
}

function splitSessionId(sessionId: string | null): { threadId: string | null; turnId: string | null } {
  if (!sessionId) {
    return { threadId: null, turnId: null };
  }
  const idx = sessionId.lastIndexOf("-");
  if (idx < 0) {
    return { threadId: sessionId, turnId: null };
  }
  return { threadId: sessionId.slice(0, idx), turnId: sessionId.slice(idx + 1) };
}

function extractItemId(event: RecentEvent): string | null {
  const metadata = event.metadata;
  if (metadata && typeof metadata["itemId"] === "string") {
    return metadata["itemId"];
  }
  const match = /\b([a-z]+_[a-zA-Z0-9]{6,})\b/.exec(eventMessage(event));
  return match?.[1] ?? null;
}

function extractVerb(event: RecentEvent): "started" | "completed" | null {
  const verb = event.metadata?.["verb"];
  if (verb === "started" || verb === "completed") {
    return verb;
  }
  const message = eventMessage(event);
  if (message.endsWith(" started")) {
    return "started";
  }
  if (message.endsWith(" completed")) {
    return "completed";
  }
  return null;
}

function extractTokenUsage(event: RecentEvent): { input: number; output: number } | null {
  const metadata = event.metadata;
  if (!metadata) {
    return null;
  }
  const usage = metadata["usage"];
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const record = usage as Record<string, unknown>;
  const input = typeof record["inputTokens"] === "number" ? record["inputTokens"] : 0;
  const output = typeof record["outputTokens"] === "number" ? record["outputTokens"] : 0;
  return { input, output };
}

function shouldMergeAsOutput(event: RecentEvent): boolean {
  const kind = eventKind(event);
  return kind === "tool_output" || kind === "tool_output_live";
}

function orderAsc(events: readonly RecentEvent[]): RecentEvent[] {
  return [...events].sort((left, right) => {
    const leftAt = eventTimestamp(left);
    const rightAt = eventTimestamp(right);
    if (leftAt < rightAt) return -1;
    if (leftAt > rightAt) return 1;
    return 0;
  });
}

function findStepToUpdate(steps: StepNode[], event: RecentEvent): StepNode | null {
  const itemId = extractItemId(event);
  if (!itemId) {
    return null;
  }
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    if (step.correlationId === itemId) {
      return step;
    }
  }
  return null;
}

function buildStep(event: RecentEvent): StepNode {
  const verb = extractVerb(event);
  return {
    kind: classifyStep(event),
    event,
    completedEvent: null,
    correlationId: extractItemId(event),
    durationMs: null,
    active: verb === "started",
    outputDeltas: [],
    timeGap: false,
  };
}

function completeStep(step: StepNode, completion: RecentEvent): void {
  step.completedEvent = completion;
  step.active = false;
  const startedMs = Date.parse(eventTimestamp(step.event));
  const completedMs = Date.parse(eventTimestamp(completion));
  if (Number.isFinite(startedMs) && Number.isFinite(completedMs) && completedMs >= startedMs) {
    step.durationMs = completedMs - startedMs;
  }
  // Promote completion event to the representative event for downstream rendering
  // (it usually carries the richer payload, diff, or final text).
  step.event = completion;
}

function applyTimeGap(previousAt: string | null, event: RecentEvent): boolean {
  if (!previousAt) {
    return false;
  }
  const previousMs = Date.parse(previousAt);
  const currentMs = Date.parse(eventTimestamp(event));
  if (!Number.isFinite(previousMs) || !Number.isFinite(currentMs)) {
    return false;
  }
  return currentMs - previousMs >= TIME_GAP_MS;
}

function buildBanner(turns: readonly TurnBlock[], preamble: PreambleBlock): LiveStateBanner | null {
  const activeTurn = turns.at(-1);

  // Prefer an in-progress step inside the most recent turn.
  if (activeTurn && activeTurn.completedAt === null) {
    const activeStep = [...activeTurn.steps].reverse().find((step) => step.active);
    if (activeStep) {
      return {
        copy: bannerCopyForStep(activeStep),
        elapsedStartedAt: eventTimestamp(activeStep.event),
        level: activeStep.kind === "error" ? "error" : "info",
      };
    }
    return {
      copy: activeTurn.turnId ? `~ Turn ${activeTurn.turnId} in progress…` : "~ Turn in progress…",
      elapsedStartedAt: activeTurn.startedAt,
      level: "info",
    };
  }

  // No active turn — fall back to preamble lifecycle if present.
  if (preamble.events.length > 0 && preamble.endedAt === null) {
    const last = preamble.events.at(-1);
    if (last) {
      const kind = eventKind(last);
      return {
        copy: bannerCopyForPreamble(last),
        elapsedStartedAt: preamble.startedAt,
        level: kind === "container_failed" || kind === "workspace_failed" ? "error" : "info",
      };
    }
  }

  if (turns.length === 0 && preamble.events.length === 0) {
    return null;
  }

  const idleCopy = activeTurn?.turnId ? `~ Idle — turn ${activeTurn.turnId} complete` : "~ Idle";
  return {
    copy: idleCopy,
    elapsedStartedAt: null,
    level: "success",
  };
}

function bannerCopyForStep(step: StepNode): string {
  switch (step.kind) {
    case "reasoning":
      return "~ Thinking…";
    case "tool_exec":
      return `~ Running: ${truncate(eventMessage(step.event), 80)}`;
    case "tool_edit":
      return `~ Editing file…`;
    case "web_search":
      return `~ Searching the web…`;
    case "mcp_tool_call":
    case "tool_call":
      return `~ Calling tool…`;
    case "agent_message":
    case "agent_message_partial":
      return `~ Writing reply…`;
    case "user_input_requested":
      return `~ Asking you a question…`;
    case "image_view":
      return `~ Viewing an image…`;
    case "error":
      return `~ ${truncate(eventMessage(step.event), 80)}`;
    default:
      return `~ ${truncate(eventMessage(step.event), 80)}`;
  }
}

function bannerCopyForPreamble(event: RecentEvent): string {
  switch (eventKind(event)) {
    case "container_starting":
      return "~ Booting container…";
    case "container_running":
      return "~ Container ready — starting Codex…";
    case "container_failed":
      return "~ Container failed to start";
    case "codex_initializing":
      return "~ Initializing Codex…";
    case "codex_config_loaded":
      return "~ Codex config loaded…";
    case "codex_requirements_loaded":
      return "~ Codex requirements loaded…";
    case "workspace_preparing":
      return "~ Preparing workspace…";
    case "workspace_ready":
      return "~ Workspace ready…";
    case "workspace_failed":
      return "~ Workspace failed";
    case "thread_loaded":
    case "thread_started":
      return "~ Starting thread…";
    default:
      return `~ ${truncate(eventMessage(event) || eventKind(event), 80)}`;
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Pure reducer: fold a flat event list into a hierarchical timeline.
 * Events are expected in unspecified order; the reducer sorts ascending internally.
 */
export function reduceEvents(events: readonly RecentEvent[]): RenderedTimeline {
  const ordered = orderAsc(events);
  const preamble: PreambleBlock = { events: [], startedAt: null, endedAt: null };
  const turns: TurnBlock[] = [];
  let lastEventAt: string | null = null;

  for (const event of ordered) {
    const kind = eventKind(event);
    const at = eventTimestamp(event);
    const sessionId = eventSessionId(event);

    if (isPreamble(event)) {
      preamble.events.push(event);
      if (!preamble.startedAt) {
        preamble.startedAt = at;
      }
      if (kind === "container_failed" || kind === "workspace_failed") {
        preamble.endedAt = at;
      }
      continue;
    }

    const { turnId } = splitSessionId(sessionId);

    // Turn lifecycle
    if (kind === "turn_started") {
      if (preamble.endedAt === null) {
        preamble.endedAt = at;
      }
      turns.push({
        turnId: turnId ?? null,
        sessionId,
        steps: [],
        startedAt: at,
        completedAt: null,
        tokenIn: 0,
        tokenOut: 0,
        events: [event],
      });
      lastEventAt = at;
      continue;
    }

    if (kind === "turn_completed") {
      const target = turns.at(-1);
      if (target) {
        target.completedAt = at;
        target.events.push(event);
        const usage = extractTokenUsage(event);
        if (usage) {
          target.tokenIn = usage.input;
          target.tokenOut = usage.output;
        }
      }
      lastEventAt = at;
      continue;
    }

    // Telemetry: accumulate token totals on the turn, but still render as a
    // muted step so every event remains visible. The user's "All" view count
    // must match what they can actually see.
    if (isTelemetry(event)) {
      const target = turns.at(-1);
      if (target) {
        target.events.push(event);
        const usage = extractTokenUsage(event);
        if (usage) {
          target.tokenIn = usage.input;
          target.tokenOut = usage.output;
        }
      }
      // Fall through to the normal step-creation path below so the event renders.
    }

    // Output deltas: attach to the matching tool step if found.
    if (shouldMergeAsOutput(event)) {
      const target = turns.at(-1);
      if (target) {
        const step = findStepToUpdate(target.steps, event);
        if (step) {
          step.outputDeltas.push(event);
        }
        target.events.push(event);
      }
      lastEventAt = at;
      continue;
    }

    // No turn yet (events arriving before turn_started) — bucket them into a synthetic turn.
    let activeTurn = turns.at(-1);
    if (!activeTurn || activeTurn.completedAt !== null) {
      activeTurn = {
        turnId: turnId ?? null,
        sessionId,
        steps: [],
        startedAt: at,
        completedAt: null,
        tokenIn: 0,
        tokenOut: 0,
        events: [],
      };
      turns.push(activeTurn);
    }

    activeTurn.events.push(event);

    const verb = extractVerb(event);
    if (verb === "completed") {
      const step = findStepToUpdate(activeTurn.steps, event);
      if (step) {
        completeStep(step, event);
        lastEventAt = at;
        continue;
      }
    }

    // Accumulate partial agent messages / reasoning into the latest matching step
    // rather than creating a new row per delta.
    if (kind === "agent_message_partial" || kind === "reasoning_delta") {
      const last = activeTurn.steps.at(-1);
      if (last && last.active && last.kind === classifyStep(event)) {
        last.event = event;
        lastEventAt = at;
        continue;
      }
    }

    const step = buildStep(event);
    step.timeGap = applyTimeGap(lastEventAt, event);
    activeTurn.steps.push(step);
    lastEventAt = at;
  }

  // Flag preamble as ended if we have any turns.
  if (preamble.endedAt === null && turns.length > 0 && preamble.events.length > 0) {
    preamble.endedAt = turns[0]?.startedAt ?? null;
  }

  const activeBanner = buildBanner(turns, preamble);

  return {
    preamble,
    turns,
    activeBanner,
    rawEvents: ordered,
  };
}
