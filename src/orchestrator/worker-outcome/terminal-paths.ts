import type { OutcomeContext } from "../context.js";
import type { PreparedWorkerOutcome, TerminalPathKind } from "./types.js";

function requireTerminalFinalizer(ctx: OutcomeContext): NonNullable<OutcomeContext["finalizeTerminalPath"]> {
  if (!ctx.finalizeTerminalPath) {
    throw new Error("OutcomeContext.finalizeTerminalPath is required");
  }
  return ctx.finalizeTerminalPath;
}

export function handleServiceStopped(ctx: OutcomeContext, prepared: PreparedWorkerOutcome): void {
  void requireTerminalFinalizer(ctx)("service_stopped", prepared);
}

export async function handleTerminalCleanup(ctx: OutcomeContext, prepared: PreparedWorkerOutcome): Promise<void> {
  await requireTerminalFinalizer(ctx)("terminal_cleanup", prepared);
}

export function handleInactiveIssue(ctx: OutcomeContext, prepared: PreparedWorkerOutcome): void {
  void requireTerminalFinalizer(ctx)("inactive_issue", prepared);
}

export function handleOperatorAbort(ctx: OutcomeContext, prepared: PreparedWorkerOutcome): void {
  void requireTerminalFinalizer(ctx)("operator_abort", prepared);
}

export async function handleCancelledOrHardFailure(
  ctx: OutcomeContext,
  prepared: PreparedWorkerOutcome,
): Promise<void> {
  await requireTerminalFinalizer(ctx)("cancelled_or_hard_failure", prepared);
}

export type { TerminalPathKind };
