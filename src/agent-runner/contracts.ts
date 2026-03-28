import type { RecentEvent, TokenUsageSnapshot } from "../core/types.js";
import type { StopSignal } from "../core/signal-detection.js";

export type AgentRunnerEventHandler = (
  event: RecentEvent & {
    usage?: TokenUsageSnapshot;
    usageMode?: "absolute_total" | "delta";
    rateLimits?: unknown;
    content?: string | null;
    /** Stop signal detected from raw (pre-truncation) agent message content. */
    stopSignal?: StopSignal | null;
    metadata?: Record<string, unknown> | null;
  },
) => void;
