import type { Request, Response } from "express";

import type { LinearClient } from "../linear/client.js";
import { buildIssueTransitionMutation } from "../linear/transition-query.js";
import type { Orchestrator } from "../orchestrator/orchestrator.js";
import { StateMachine } from "../state/machine.js";
import type { ConfigStore } from "../config/store.js";
import { asBooleanOrNull, asRecord, asStringOrNull } from "../utils/type-guards.js";
import type { TransitionBody } from "./request-schemas.js";

interface TransitionDeps {
  orchestrator: Orchestrator;
  linearClient?: LinearClient;
  configStore?: ConfigStore;
}

/**
 * Handles POST /:issue_identifier/transition.
 *
 * Expects `validateBody(transitionSchema)` middleware to have already
 * validated and attached the parsed body to `req.body`.
 */
export async function handleTransition(deps: TransitionDeps, req: Request, res: Response): Promise<void> {
  const body = req.body as TransitionBody;
  const targetState = body.target_state;

  const identifier = String(req.params.issue_identifier);
  const detail = deps.orchestrator.getIssueDetail(identifier);
  if (!detail) {
    res.status(404).json({ error: { code: "not_found", message: "Unknown issue identifier" } });
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
      res.status(422).json({ ok: false, reason: assertion.reason });
      return;
    }
  }

  if (!deps.linearClient) {
    res.status(503).json({ error: { code: "unavailable", message: "Linear client not configured" } });
    return;
  }

  // Resolve Linear workflow state UUID (team-filtered when project slug is configured)
  const stateId = await deps.linearClient.resolveStateId(targetState);
  if (!stateId) {
    res.status(422).json({ ok: false, reason: `No Linear state found matching: ${targetState}` });
    return;
  }

  // Execute transition via Linear API
  const mutationPayload = await deps.linearClient.runGraphQL(buildIssueTransitionMutation(), { issueId, stateId });
  const issueUpdate = asRecord(asRecord(mutationPayload.data).issueUpdate);
  const success = asBooleanOrNull(issueUpdate.success);

  if (!success) {
    res.status(422).json({ ok: false, reason: "Linear issue update failed" });
    return;
  }

  deps.orchestrator.requestRefresh("manual-transition");
  res.json({ ok: true, from: currentState, to: targetState });
}
