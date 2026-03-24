import type { RecentEvent, TokenUsageSnapshot } from "../core/types.js";

export type AgentRunnerEventHandler = (
  event: RecentEvent & {
    usage?: TokenUsageSnapshot;
    usageMode?: "absolute_total" | "delta";
    rateLimits?: unknown;
    content?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) => void;
