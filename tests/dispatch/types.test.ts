import { describe, it, expect } from "vitest";
import type { AgentRunner } from "../../src/agent-runner/index.js";
import type { RunAttemptDispatcher } from "../../src/dispatch/types.js";

describe("Dispatch types", () => {
  it("AgentRunner satisfies RunAttemptDispatcher interface", () => {
    // This is a compile-time check. If AgentRunner doesn't satisfy
    // RunAttemptDispatcher, TypeScript will error on this assignment.
    const _dispatcher: RunAttemptDispatcher = null as unknown as AgentRunner;
    expect(_dispatcher).toBeDefined();
  });
});
