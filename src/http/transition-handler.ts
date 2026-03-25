import type { FastifyReply, FastifyRequest } from "fastify";

import type { LinearClient } from "../linear/client.js";
import { buildIssueTransitionMutation } from "../linear/transition-query.js";
import type { Orchestrator } from "../orchestrator/orchestrator.js";
import { StateMachine } from "../state/machine.js";
import type { ConfigStore } from "../config/store.js";
import { asBooleanOrNull, asRecord, asStringOrNull } from "../utils/type-guards.js";

interface TransitionDeps {
  orchestrator: Orchestrator;
  linearClient?: LinearClient;
  configStore?: ConfigStore;
}

export async function handleTransition(
  deps: TransitionDeps,
  request: FastifyRequest<{ Params: { issue_identifier: string }; Body: Record<string, unknown> }>,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body ?? {};
  const targetState = typeof body.target_state === "string" ? body.target_state.trim() : null;
  if (!targetState) {
    reply.status(400).send({ error: { code: "missing_target_state", message: "target_state is required" } });
    return;
  }

  const identifier = String(request.params.issue_identifier);
  const detail = deps.orchestrator.getIssueDetail(identifier);
  if (!detail) {
    reply.status(404).send({ error: { code: "not_found", message: "Unknown issue identifier" } });
    return;
  }

  const currentState = asStringOrNull(detail.state) ?? "";
  const issueId = asStringOrNull(detail.issueId) ?? "";

  if (deps.configStore) {
    const config = deps.configStore.getConfig();
    const machine = config.stateMachine
      ? new StateMachine({
          stages: config.stateMachine.stages.map((s) => ({ key: s.name, terminal: s.kind === "terminal" })),
          transitions: config.stateMachine.transitions,
          activeStates: config.tracker.activeStates,
          terminalStates: config.tracker.terminalStates,
        })
      : new StateMachine({
          activeStates: config.tracker.activeStates,
          terminalStates: config.tracker.terminalStates,
        });

    const assertion = machine.assertTransition(currentState, targetState);
    if (!assertion.ok) {
      reply.status(422).send({ ok: false, reason: assertion.reason });
      return;
    }
  }

  if (!deps.linearClient) {
    reply.status(503).send({ error: { code: "unavailable", message: "Linear client not configured" } });
    return;
  }

  // Resolve Linear workflow state UUID (team-filtered when project slug is configured)
  const stateId = await deps.linearClient.resolveStateId(targetState);
  if (!stateId) {
    reply.status(422).send({ ok: false, reason: `No Linear state found matching: ${targetState}` });
    return;
  }

  // Execute transition via Linear API
  const mutationPayload = await deps.linearClient.runGraphQL(buildIssueTransitionMutation(), { issueId, stateId });
  const issueUpdate = asRecord(asRecord(mutationPayload.data).issueUpdate);
  const success = asBooleanOrNull(issueUpdate.success);

  if (!success) {
    reply.status(422).send({ ok: false, reason: "Linear issue update failed" });
    return;
  }

  deps.orchestrator.requestRefresh("manual-transition");
  reply.send({ ok: true, from: currentState, to: targetState });
}
