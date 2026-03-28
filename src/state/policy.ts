import type { ServiceConfig, StateStageKind } from "../core/types.js";
import { StateMachine } from "./machine.js";

export const DEFAULT_ACTIVE_STATES = ["Backlog", "Todo", "In Progress"];
export const DEFAULT_TERMINAL_STATES = ["Done", "Canceled"];
const STATE_MACHINE_CACHE = new WeakMap<object, StateMachine>();
const TRACKER_STATE_CACHE = new WeakMap<ServiceConfig, { active: Set<string>; terminal: Set<string> }>();
const STATE_STAGE_CACHE = new WeakMap<
  object,
  {
    activeOrTodo: Set<string>;
    gate: Set<string>;
    todo: Set<string>;
  }
>();

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
  return getTrackerStateSets(config).terminal.has(normalizeStateValue(state));
}

export function isActiveState(state: string, config: ServiceConfig): boolean {
  if (config.stateMachine) {
    return getStageSets(config.stateMachine).activeOrTodo.has(normalizeStateValue(state));
  }
  return getTrackerStateSets(config).active.has(normalizeStateValue(state));
}

export function isGateState(state: string, config: ServiceConfig): boolean {
  if (config.stateMachine) {
    return getStageSets(config.stateMachine).gate.has(normalizeStateValue(state));
  }
  return false;
}

export function isTodoState(state: string, config?: ServiceConfig): boolean {
  if (config?.stateMachine) {
    return getStageSets(config.stateMachine).todo.has(normalizeStateValue(state));
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
    const kind: StateStageKind = key === "backlog" ? "backlog" : key === "todo" ? "todo" : "active";
    appendStage(stages, seen, {
      key,
      label: state,
      kind,
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

function getTrackerStateSets(config: ServiceConfig): { active: Set<string>; terminal: Set<string> } {
  const cached = TRACKER_STATE_CACHE.get(config);
  if (cached) {
    return cached;
  }

  const computed = {
    active: new Set(normalizeStateList(config.tracker.activeStates)),
    terminal: new Set(normalizeStateList(config.tracker.terminalStates)),
  };
  TRACKER_STATE_CACHE.set(config, computed);
  return computed;
}

function getStageSets(stateMachineConfig: NonNullable<ServiceConfig["stateMachine"]>): {
  activeOrTodo: Set<string>;
  gate: Set<string>;
  todo: Set<string>;
} {
  const cached = STATE_STAGE_CACHE.get(stateMachineConfig);
  if (cached) {
    return cached;
  }

  const activeOrTodo = new Set<string>();
  const gate = new Set<string>();
  const todo = new Set<string>();
  for (const stage of stateMachineConfig.stages) {
    const normalizedStage = normalizeStateValue(stage.name);
    if (stage.kind === "active" || stage.kind === "todo") {
      activeOrTodo.add(normalizedStage);
    }
    if (stage.kind === "gate") {
      gate.add(normalizedStage);
    }
    if (stage.kind === "todo") {
      todo.add(normalizedStage);
    }
  }

  const computed = { activeOrTodo, gate, todo };
  STATE_STAGE_CACHE.set(stateMachineConfig, computed);
  return computed;
}

export function getStateMachine(config: ServiceConfig): StateMachine {
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
