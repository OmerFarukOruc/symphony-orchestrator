export interface TurnState {
  reasoningBuffers: Map<string, string>;
  turnCompletionResolvers: Map<string, (payload: unknown) => void>;
  completedTurnNotifications: Map<string, unknown>;
  reviewSummaries: Map<string, string>;
}

export function createTurnState(): TurnState {
  return {
    reasoningBuffers: new Map<string, string>(),
    turnCompletionResolvers: new Map<string, (payload: unknown) => void>(),
    completedTurnNotifications: new Map<string, unknown>(),
    reviewSummaries: new Map<string, string>(),
  };
}

export function composeSessionId(threadId: string | null, turnId: string | null): string | null {
  if (!threadId || !turnId) {
    return threadId;
  }
  return `${threadId}-${turnId}`;
}

export function appendReasoningText(state: TurnState, itemId: string | null, text: string | null): void {
  if (!itemId || !text) {
    return;
  }
  const current = state.reasoningBuffers.get(itemId) ?? "";
  state.reasoningBuffers.set(itemId, current + text);
}

export function deleteReasoningBuffer(state: TurnState, itemId: string | null): void {
  if (!itemId) {
    return;
  }
  state.reasoningBuffers.delete(itemId);
}

export function recordCompletedTurn(state: TurnState, turnId: string | null, payload: unknown): void {
  if (!turnId) {
    return;
  }
  const resolver = state.turnCompletionResolvers.get(turnId);
  if (resolver) {
    resolver(payload);
    state.turnCompletionResolvers.delete(turnId);
    return;
  }
  state.completedTurnNotifications.set(turnId, payload);
}

export function recordReviewSummary(state: TurnState, turnId: string | null, summary: string | null): void {
  if (!turnId || !summary) {
    return;
  }
  state.reviewSummaries.set(turnId, summary);
}

export function consumeReviewSummary(state: TurnState, turnId: string | null): string | null {
  if (!turnId) {
    return null;
  }
  const summary = state.reviewSummaries.get(turnId) ?? null;
  state.reviewSummaries.delete(turnId);
  return summary;
}

export function waitForTurnCompletion(
  state: TurnState,
  input: { turnId: string; signal: AbortSignal; timeoutMs: number },
): Promise<unknown> {
  const alreadyCompleted = state.completedTurnNotifications.get(input.turnId);
  if (alreadyCompleted !== undefined) {
    state.completedTurnNotifications.delete(input.turnId);
    return Promise.resolve(alreadyCompleted);
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      state.turnCompletionResolvers.delete(input.turnId);
      clearTimeout(timer);
      reject(new Error("turn completion interrupted"));
    };
    const timer = setTimeout(() => {
      state.turnCompletionResolvers.delete(input.turnId);
      input.signal.removeEventListener("abort", onAbort);
      reject(new Error(`timed out waiting for turn completion after ${input.timeoutMs}ms`));
    }, input.timeoutMs);

    state.turnCompletionResolvers.set(input.turnId, (payload) => {
      clearTimeout(timer);
      input.signal.removeEventListener("abort", onAbort);
      resolve(payload);
    });
    input.signal.addEventListener("abort", onAbort, { once: true });
  });
}
