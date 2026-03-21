import type { Request, Response } from "express";

import type { Orchestrator } from "../orchestrator/orchestrator.js";
import { StateMachine } from "../state/machine.js";
import type { ConfigStore } from "../config/store.js";

interface TransitionsDeps {
  orchestrator: Orchestrator;
  configStore?: ConfigStore;
}

export function handleGetTransitions(deps: TransitionsDeps, _req: Request, res: Response): void {
  if (!deps.configStore) {
    res.json({ transitions: {} });
    return;
  }

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

  const stages = machine.getStages();
  const transitions: Record<string, string[]> = {};
  for (const from of stages) {
    transitions[from.key] = stages.filter((to) => machine.canTransition(from.key, to.key)).map((to) => to.key);
  }

  res.json({ transitions });
}
