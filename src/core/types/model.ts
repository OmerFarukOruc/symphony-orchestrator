export interface TokenUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ModelSelection {
  model: string;
  reasoningEffort: ReasoningEffort | null;
  source: "default" | "override";
}
