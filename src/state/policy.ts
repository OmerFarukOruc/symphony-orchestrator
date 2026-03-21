import type { ServiceConfig, StateStageKind } from "../core/types.js";
import { StateMachine } from "./machine.js";

export const DEFAULT_ACTIVE_STATES = ["Todo", "In Progress"];
export const DEFAULT_TERMINAL_STATES = ["Done", "Completed", "Closed", "Canceled", "Duplicate"];
const STATE_MACHINE_CACHE = new WeakMap<object, StateMachine>();

function normalizeStateValue(state: string): string {
  return state.trim().toLowerCase();
}

export function normalizeStateList(states: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const state of states) {
    const next = normalizeStateValue(state);
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    normalized.push(next);
  }
  return normalized;
}

export function isTerminalState(state: string, config: ServiceConfig): boolean {
  if (config.stateMachine) {
    return getStateMachine(config).isTerminalState(state);
  }
  return normalizeStateList(config.tracker.terminalStates).includes(normalizeStateValue(state));
}

export function isActiveState(state: string, config: ServiceConfig): boolean {
  if (config.stateMachine) {
    return config.stateMachine.stages.some(
      (stage) =>
        normalizeStateValue(stage.name) === normalizeStateValue(state) &&
        (stage.kind === "active" || stage.kind === "todo"),
    );
  }
  return normalizeStateList(config.tracker.activeStates).includes(normalizeStateValue(state));
}

export function isTodoState(state: string, config?: ServiceConfig): boolean {
  if (config?.stateMachine) {
    return config.stateMachine.stages.some(
      (stage) => normalizeStateValue(stage.name) === normalizeStateValue(state) && stage.kind === "todo",
    );
  }
  return normalizeStateValue(state) === "todo";
}

export function normalizeStateKey(state: string): string {
  return normalizeStateValue(state);
}

interface WorkflowStageDefinition {
  key: string;
  label: string;
  kind: StateStageKind | "other";
  terminal: boolean;
}

function appendStage(stages: WorkflowStageDefinition[], seen: Set<string>, stage: WorkflowStageDefinition): void {
  if (!stage.key || seen.has(stage.key)) {
    return;
  }
  seen.add(stage.key);
  stages.push(stage);
}

export function listWorkflowStages(config: ServiceConfig): WorkflowStageDefinition[] {
  const stages: WorkflowStageDefinition[] = [];
  const seen = new Set<string>();

  if (config.stateMachine?.stages?.length) {
    for (const stage of config.stateMachine.stages) {
      appendStage(stages, seen, {
        key: normalizeStateValue(stage.name),
        label: stage.name,
        kind: stage.kind,
        terminal: stage.kind === "terminal",
      });
    }
    return stages;
  }

  for (const state of config.tracker.activeStates) {
    const key = normalizeStateValue(state);
    appendStage(stages, seen, {
      key,
      label: state,
      kind: key === "todo" ? "todo" : "active",
      terminal: false,
    });
  }

  for (const terminalLabel of config.tracker.terminalStates) {
    appendStage(stages, seen, {
      key: normalizeStateValue(terminalLabel),
      label: terminalLabel,
      kind: "terminal",
      terminal: true,
    });
  }

  return stages;
}

function getStateMachine(config: ServiceConfig): StateMachine {
  const stateMachineConfig = config.stateMachine;
  if (!stateMachineConfig) {
    return new StateMachine({
      activeStates: config.tracker.activeStates,
      terminalStates: config.tracker.terminalStates,
    });
  }
  const cached = STATE_MACHINE_CACHE.get(stateMachineConfig);
  if (cached) {
    return cached;
  }
  const machine = new StateMachine({
    stages: stateMachineConfig.stages.map((stage) => ({
      key: stage.name,
      terminal: stage.kind === "terminal",
    })),
    transitions: stateMachineConfig.transitions,
    activeStates: config.tracker.activeStates,
    terminalStates: config.tracker.terminalStates,
  });
  STATE_MACHINE_CACHE.set(stateMachineConfig, machine);
  return machine;
}
