import type { Request, Response } from "express";

import { getStateMachine } from "../state/policy.js";
import type { ConfigStore } from "../config/store.js";
import type { OrchestratorPort } from "../orchestrator/port.js";

interface TransitionsDeps {
  orchestrator: OrchestratorPort;
  configStore?: ConfigStore;
}

export function handleGetTransitions(deps: TransitionsDeps, _req: Request, res: Response): void {
  if (!deps.configStore) {
    res.json({ transitions: {} });
    return;
  }

  const config = deps.configStore.getConfig();
  const machine = getStateMachine(config);

  const stages = machine.getStages();
  const transitions: Record<string, string[]> = {};
  for (const from of stages) {
    transitions[from.key] = stages.filter((to) => machine.canTransition(from.key, to.key)).map((to) => to.key);
  }

  res.json({ transitions });
}
