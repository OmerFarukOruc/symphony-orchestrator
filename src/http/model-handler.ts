import type { Request, Response } from "express";

import type { Orchestrator } from "../orchestrator.js";
import type { ReasoningEffort } from "../types.js";

function asModel(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseReasoningEffort(
  value: unknown,
): { ok: true; value: ReasoningEffort | null } | { ok: false; code: string; message: string } {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, code: "invalid_reasoning_effort", message: "reasoning_effort must be a string" };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  const valid: ReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh"];
  if (valid.includes(trimmed as ReasoningEffort)) {
    return { ok: true, value: trimmed as ReasoningEffort };
  }
  return {
    ok: false,
    code: "invalid_reasoning_effort",
    message: `Invalid reasoning_effort "${trimmed}". Allowed values: ${valid.join(", ")}`,
  };
}

export async function handleModelUpdate(
  orchestrator: Orchestrator,
  request: Request,
  response: Response,
): Promise<void> {
  const model = asModel(request.body?.model);
  const effortResult = parseReasoningEffort(request.body?.reasoning_effort ?? request.body?.reasoningEffort);
  if (!model) {
    response.status(400).json({
      error: {
        code: "invalid_model",
        message: "model is required",
      },
    });
    return;
  }
  if (!effortResult.ok) {
    response.status(400).json({
      error: {
        code: effortResult.code,
        message: effortResult.message,
      },
    });
    return;
  }
  const updated = await orchestrator.updateIssueModelSelection({
    identifier: String(request.params.issue_identifier),
    model,
    reasoningEffort: effortResult.value,
  });
  if (!updated) {
    response.status(404).json({
      error: {
        code: "not_found",
        message: "Unknown issue identifier",
      },
    });
    return;
  }
  response.status(202).json({
    updated: updated.updated,
    restarted: updated.restarted,
    applies_next_attempt: updated.appliesNextAttempt,
    selection: {
      model: updated.selection.model,
      reasoning_effort: updated.selection.reasoningEffort,
      source: updated.selection.source,
    },
  });
}
