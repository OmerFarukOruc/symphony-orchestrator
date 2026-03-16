import type { ServiceConfig } from "./types.js";

export const DEFAULT_ACTIVE_STATES = ["Todo", "In Progress"];
export const DEFAULT_TERMINAL_STATES = ["Done", "Completed", "Closed", "Canceled", "Cancelled", "Duplicate"];

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
  return normalizeStateList(config.tracker.terminalStates).includes(normalizeStateValue(state));
}

export function isActiveState(state: string, config: ServiceConfig): boolean {
  return normalizeStateList(config.tracker.activeStates).includes(normalizeStateValue(state));
}

export function isTodoState(state: string): boolean {
  return normalizeStateValue(state) === "todo";
}

export function normalizeStateKey(state: string): string {
  return normalizeStateValue(state);
}
