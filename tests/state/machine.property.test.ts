import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { StateMachine, createDefaultStateMachine } from "../../src/state/machine.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty trimmed state name suitable for the state machine. */
const stateNameArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim());

/** List of unique state names (1-8 elements). */
const stateListArb = fc.uniqueArray(stateNameArb, { minLength: 1, maxLength: 8 });

/** The five default states used by createDefaultStateMachine(). */
const defaultStates = ["backlog", "todo", "in progress", "done", "canceled"];

// ---------------------------------------------------------------------------
// Property: self-transition is always valid
// ---------------------------------------------------------------------------

describe("state machine properties", () => {
  it("property: self-transition is always valid for any known state", () => {
    fc.assert(
      fc.property(stateListArb, stateListArb, (active, terminal) => {
        const sm = new StateMachine({ activeStates: active, terminalStates: terminal });
        const allStates = [...active, ...terminal];

        for (const state of allStates) {
          expect(sm.canTransition(state, state)).toBe(true);
        }
      }),
    );
  });

  it("property: self-transition holds for default machine states", () => {
    fc.assert(
      fc.property(fc.constantFrom(...defaultStates), (state) => {
        const sm = createDefaultStateMachine();
        expect(sm.canTransition(state, state)).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Property: normalization is idempotent
  // ---------------------------------------------------------------------------

  it("property: normalization is idempotent — lookup is stable regardless of casing or whitespace", () => {
    fc.assert(
      fc.property(stateListArb, stateListArb, (active, terminal) => {
        const sm = new StateMachine({ activeStates: active, terminalStates: terminal });

        for (const state of [...active, ...terminal]) {
          // First normalization: lowercase + trim (what the machine does internally)
          const normalized = state.trim().toLowerCase();
          // The machine should recognize both the original and normalized form
          expect(sm.isKnownState(state)).toBe(true);
          expect(sm.isKnownState(normalized)).toBe(true);
          // Applying the same normalization again should not change the result
          const doubleNormalized = normalized.trim().toLowerCase();
          expect(sm.isKnownState(doubleNormalized)).toBe(sm.isKnownState(normalized));
        }
      }),
    );
  });

  it("property: case variations of a known state all resolve the same way", () => {
    fc.assert(
      fc.property(stateListArb, stateListArb, (active, terminal) => {
        const sm = new StateMachine({ activeStates: active, terminalStates: terminal });

        for (const state of [...active, ...terminal]) {
          const upper = state.toUpperCase();
          const lower = state.toLowerCase();
          const mixed = state
            .split("")
            .map((char, index) => (index % 2 === 0 ? char.toUpperCase() : char.toLowerCase()))
            .join("");

          expect(sm.isKnownState(upper)).toBe(sm.isKnownState(lower));
          expect(sm.isKnownState(mixed)).toBe(sm.isKnownState(lower));
          expect(sm.isTerminalState(upper)).toBe(sm.isTerminalState(lower));
          expect(sm.isTerminalState(mixed)).toBe(sm.isTerminalState(lower));
        }
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Property: terminal states cannot transition out
  // ---------------------------------------------------------------------------

  it("property: terminal states cannot transition to any different state", () => {
    fc.assert(
      fc.property(stateListArb, stateListArb, (active, terminal) => {
        const sm = new StateMachine({ activeStates: active, terminalStates: terminal });
        const allStates = [...active, ...terminal];

        for (const from of terminal) {
          // Only test pure terminal states (not also in active set)
          const fromNorm = from.trim().toLowerCase();
          if (!new Set(active.map((s) => s.trim().toLowerCase())).has(fromNorm)) {
            for (const to of allStates) {
              const toNorm = to.trim().toLowerCase();
              if (fromNorm !== toNorm) {
                expect(sm.canTransition(from, to)).toBe(false);
              }
            }
          }
        }
      }),
    );
  });

  it("property: terminal states in default machine only allow self-transition", () => {
    const terminalDefaults = ["done", "canceled"];
    const sm = createDefaultStateMachine();

    fc.assert(
      fc.property(fc.constantFrom(...terminalDefaults), fc.constantFrom(...defaultStates), (from, to) => {
        if (from === to) {
          expect(sm.canTransition(from, to)).toBe(true);
        } else {
          expect(sm.canTransition(from, to)).toBe(false);
        }
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Property: getStages produces no duplicate keys
  // ---------------------------------------------------------------------------

  it("property: getStages never contains duplicate keys", () => {
    fc.assert(
      fc.property(stateListArb, stateListArb, (active, terminal) => {
        const sm = new StateMachine({ activeStates: active, terminalStates: terminal });
        const stages = sm.getStages();
        const keys = stages.map((stage) => stage.key);
        const uniqueKeys = new Set(keys);

        expect(keys).toHaveLength(uniqueKeys.size);
      }),
    );
  });

  it("property: feeding duplicate state names still produces unique stages", () => {
    fc.assert(
      fc.property(stateNameArb, fc.integer({ min: 2, max: 10 }), (name, count) => {
        const duplicates = Array.from({ length: count }, () => name);
        const sm = new StateMachine({ activeStates: duplicates, terminalStates: [] });
        const stages = sm.getStages();
        const keys = stages.map((stage) => stage.key);
        const uniqueKeys = new Set(keys);

        expect(keys).toHaveLength(uniqueKeys.size);
        // Should collapse to exactly one entry
        expect(keys).toHaveLength(1);
      }),
    );
  });

  it("property: mixed-case duplicates collapse to one stage", () => {
    fc.assert(
      fc.property(stateNameArb, (name) => {
        const variants = [name, name.toUpperCase(), name.toLowerCase()];
        const sm = new StateMachine({ activeStates: variants, terminalStates: [] });
        const stages = sm.getStages();
        const keys = stages.map((stage) => stage.key);
        const uniqueKeys = new Set(keys);

        expect(keys).toHaveLength(uniqueKeys.size);
      }),
    );
  });
});
