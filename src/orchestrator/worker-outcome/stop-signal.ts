import type { StopSignal } from "../../core/signal-detection.js";
import type { OutcomeContext } from "../context.js";
import type { PreparedWorkerOutcome } from "./types.js";

function requireStopSignalFinalizer(ctx: OutcomeContext): NonNullable<OutcomeContext["finalizeStopSignal"]> {
  if (!ctx.finalizeStopSignal) {
    throw new Error("OutcomeContext.finalizeStopSignal is required");
  }
  return ctx.finalizeStopSignal;
}

export async function handleStopSignal(
  ctx: OutcomeContext,
  stopSignal: StopSignal,
  prepared: PreparedWorkerOutcome,
  turnCount: number | null = null,
): Promise<void> {
  await requireStopSignalFinalizer(ctx)(stopSignal, prepared, turnCount);
}
