import type { FastifyReply, FastifyRequest } from "fastify";

import type { Orchestrator } from "../orchestrator/orchestrator.js";

export function handleAttemptDetail(
  orchestrator: Orchestrator,
  request: FastifyRequest<{ Params: { attempt_id: string } }>,
  reply: FastifyReply,
): void {
  const attempt = orchestrator.getAttemptDetail(String(request.params.attempt_id));
  if (!attempt) {
    reply.status(404).send({
      error: {
        code: "not_found",
        message: "Unknown attempt identifier",
      },
    });
    return;
  }
  reply.send(attempt);
}
