import type { FastifyReply, FastifyRequest } from "fastify";

import type { Orchestrator } from "../orchestrator/orchestrator.js";
import type { ReasoningEffort } from "../core/types.js";

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
  request: FastifyRequest<{ Params: { issue_identifier: string }; Body: Record<string, unknown> }>,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body ?? {};
  const model = asModel(body.model);
  const effortResult = parseReasoningEffort(body.reasoning_effort ?? body.reasoningEffort);
  if (!model) {
    reply.status(400).send({
      error: {
        code: "invalid_model",
        message: "model is required",
      },
    });
    return;
  }
  if (!effortResult.ok) {
    reply.status(400).send({
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
    reply.status(404).send({
      error: {
        code: "not_found",
        message: "Unknown issue identifier",
      },
    });
    return;
  }
  reply.status(202).send({
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
