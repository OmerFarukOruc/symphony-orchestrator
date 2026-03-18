const DEFAULT_ACTIVE_STATES = ["Todo", "In Progress"];
const DEFAULT_TERMINAL_STATES = ["Done", "Completed", "Closed", "Canceled", "Cancelled", "Duplicate"];

interface StateMachineStage {
  key: string;
  terminal: boolean;
}

interface StateMachineConfigInput {
  stages?: Array<string | { key: string; terminal?: boolean }>;
  transitions?: Record<string, string[]>;
  activeStates?: string[];
  terminalStates?: string[];
}

function normalizeState(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueStates(states: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const state of states) {
    const next = normalizeState(state);
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    normalized.push(next);
  }
  return normalized;
}

function toStageRecord(
  input: Array<string | { key: string; terminal?: boolean }> | undefined,
  activeStates: string[],
  terminalStates: string[],
): StateMachineStage[] {
  if (input && input.length > 0) {
    const deduped = new Map<string, StateMachineStage>();
    for (const entry of input) {
      if (typeof entry === "string") {
        const key = normalizeState(entry);
        if (!key) {
          continue;
        }
        deduped.set(key, {
          key,
          terminal: terminalStates.includes(key),
        });
        continue;
      }
      const key = normalizeState(entry.key);
      if (!key) {
        continue;
      }
      deduped.set(key, {
        key,
        terminal: Boolean(entry.terminal),
      });
    }
    return [...deduped.values()];
  }

  const all = uniqueStates([...activeStates, ...terminalStates]);
  return all.map((key) => ({
    key,
    terminal: terminalStates.includes(key),
  }));
}

function buildExplicitTransitions(
  known: Set<string>,
  explicitTransitions: Record<string, string[]>,
): Map<string, Set<string>> {
  const transitions = new Map<string, Set<string>>();
  for (const [from, rawTargets] of Object.entries(explicitTransitions)) {
    const normalizedFrom = normalizeState(from);
    if (!known.has(normalizedFrom)) {
      continue;
    }
    const allowed = new Set<string>();
    for (const target of rawTargets) {
      const normalizedTarget = normalizeState(target);
      if (known.has(normalizedTarget)) {
        allowed.add(normalizedTarget);
      }
    }
    allowed.add(normalizedFrom);
    transitions.set(normalizedFrom, allowed);
  }
  return transitions;
}

function buildDefaultTransitions(stages: StateMachineStage[]): Map<string, Set<string>> {
  const transitions = new Map<string, Set<string>>();
  const stageKeys = stages.map((s) => s.key);
  const terminalByKey = new Map(stages.map((s) => [s.key, s.terminal]));

  for (const from of stageKeys) {
    const allowed = new Set<string>();
    if (terminalByKey.get(from)) {
      allowed.add(from);
    } else {
      for (const target of stageKeys) {
        allowed.add(target);
      }
    }
    transitions.set(from, allowed);
  }
  return transitions;
}

function buildTransitionMap(
  stages: StateMachineStage[],
  explicitTransitions: Record<string, string[]> | undefined,
): Map<string, Set<string>> {
  const known = new Set(stages.map((stage) => stage.key));
  if (explicitTransitions && Object.keys(explicitTransitions).length > 0) {
    return buildExplicitTransitions(known, explicitTransitions);
  }
  return buildDefaultTransitions(stages);
}

export class StateMachine {
  private readonly stages: StateMachineStage[];
  private readonly stageSet: Set<string>;
  private readonly transitionMap: Map<string, Set<string>>;

  constructor(config: StateMachineConfigInput = {}) {
    const activeStates = uniqueStates(config.activeStates ?? DEFAULT_ACTIVE_STATES);
    const terminalStates = uniqueStates(config.terminalStates ?? DEFAULT_TERMINAL_STATES);
    this.stages = toStageRecord(config.stages, activeStates, terminalStates);
    this.stageSet = new Set(this.stages.map((stage) => stage.key));
    this.transitionMap = buildTransitionMap(this.stages, config.transitions);
  }

  getStages(): StateMachineStage[] {
    return this.stages.map((stage) => ({ ...stage }));
  }

  isKnownState(state: string): boolean {
    return this.stageSet.has(normalizeState(state));
  }

  isTerminalState(state: string): boolean {
    const normalized = normalizeState(state);
    return this.stages.some((stage) => stage.key === normalized && stage.terminal);
  }

  canTransition(from: string, to: string): boolean {
    const normalizedFrom = normalizeState(from);
    const normalizedTo = normalizeState(to);
    if (!this.stageSet.has(normalizedFrom) || !this.stageSet.has(normalizedTo)) {
      return false;
    }
    const allowed = this.transitionMap.get(normalizedFrom);
    if (!allowed) {
      return normalizedFrom === normalizedTo;
    }
    return allowed.has(normalizedTo);
  }

  assertTransition(from: string, to: string): { ok: true } | { ok: false; reason: string } {
    if (!this.isKnownState(from)) {
      return { ok: false, reason: `unknown source state: ${from}` };
    }
    if (!this.isKnownState(to)) {
      return { ok: false, reason: `unknown target state: ${to}` };
    }
    if (!this.canTransition(from, to)) {
      return {
        ok: false,
        reason: `invalid transition: ${normalizeState(from)} -> ${normalizeState(to)}`,
      };
    }
    return { ok: true };
  }
}

export function createDefaultStateMachine(): StateMachine {
  return new StateMachine({
    activeStates: DEFAULT_ACTIVE_STATES,
    terminalStates: DEFAULT_TERMINAL_STATES,
  });
}
