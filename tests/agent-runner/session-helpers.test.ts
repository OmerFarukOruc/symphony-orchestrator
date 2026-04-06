import { describe, expect, it, vi, afterEach } from "vitest";
import { EventEmitter, Readable } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { waitForStartup, buildDynamicTools, StartupTimeoutError } from "../../src/agent-runner/session-helpers.js";
import { NullTrackerToolProvider } from "../../src/tracker/tool-provider.js";
import type { RisolutoLogger } from "../../src/core/types.js";

afterEach(() => {
  vi.useRealTimers();
});

function makeFakeChild(): ChildProcessWithoutNullStreams {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  (child as unknown as Record<string, unknown>).stdout = stdout;
  (child as unknown as Record<string, unknown>).stderr = stderr;
  return child;
}

describe("waitForStartup", () => {
  it("resolves immediately when timeoutMs is 0", async () => {
    const child = makeFakeChild();
    const result = await waitForStartup(child, 0, new AbortController().signal);
    expect(result).toEqual({ stderrOutput: "" });
  });

  it("resolves immediately when timeoutMs is negative", async () => {
    const child = makeFakeChild();
    const result = await waitForStartup(child, -1, new AbortController().signal);
    expect(result).toEqual({ stderrOutput: "" });
  });

  it("resolves when stdout emits data", async () => {
    const child = makeFakeChild();
    const promise = waitForStartup(child, 5000, new AbortController().signal);
    child.stdout.push("ready");
    const result = await promise;
    expect(result.stderrOutput).toBe("");
  });

  it("resolves when stderr emits data", async () => {
    const child = makeFakeChild();
    const promise = waitForStartup(child, 5000, new AbortController().signal);
    child.stderr.push("warning output");
    const result = await promise;
    expect(result.stderrOutput).toContain("warning output");
  });

  it("rejects when child exits before readiness", async () => {
    const child = makeFakeChild();
    const promise = waitForStartup(child, 5000, new AbortController().signal);
    child.emit("exit", 1);
    await expect(promise).rejects.toThrow("child exited with code 1 before startup readiness");
  });

  it("rejects when abort signal fires", async () => {
    const child = makeFakeChild();
    const controller = new AbortController();
    const promise = waitForStartup(child, 5000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow("startup readiness interrupted");
  });

  it("rejects with StartupTimeoutError on timeout", async () => {
    vi.useFakeTimers();
    const child = makeFakeChild();
    const promise = waitForStartup(child, 100, new AbortController().signal);
    vi.advanceTimersByTime(101);
    await expect(promise).rejects.toThrow(StartupTimeoutError);
    await expect(promise).rejects.toThrow("startup readiness timed out after 100ms");
  });

  it("includes diagnostic hint in StartupTimeoutError when no output captured", async () => {
    vi.useFakeTimers();
    const child = makeFakeChild();
    const promise = waitForStartup(child, 100, new AbortController().signal);
    vi.advanceTimersByTime(101);
    try {
      await promise;
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(StartupTimeoutError);
      expect((error as StartupTimeoutError).stderrOutput).toBe("");
      expect((error as StartupTimeoutError).message).toContain(
        "no stderr output captured (container may have produced no output)",
      );
    }
  });

  it("only settles once even if multiple events arrive", async () => {
    const child = makeFakeChild();
    const promise = waitForStartup(child, 5000, new AbortController().signal);
    child.stdout.push("first");
    // First data event resolves; subsequent events are ignored
    const result = await promise;
    expect(result.stderrOutput).toBe("");
  });
});

const linearProvider = { toolNames: ["linear_graphql"], handleToolCall: vi.fn() };
const testLogger: RisolutoLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
};

describe("buildDynamicTools", () => {
  it("returns two tool definitions when tracker provides linear_graphql", () => {
    const tools = buildDynamicTools(linearProvider, testLogger);
    expect(tools.length).toBe(2);
  });

  it("returns one tool definition when tracker provides no tools", () => {
    const tools = buildDynamicTools(new NullTrackerToolProvider(), testLogger);
    expect(tools.length).toBe(1);
  });

  it("includes linear_graphql tool with correct schema", () => {
    const tools = buildDynamicTools(linearProvider, testLogger) as Array<{
      name: string;
      inputSchema: Record<string, unknown>;
    }>;
    const linearTool = tools.find((t) => t.name === "linear_graphql");
    expect(linearTool).toMatchObject({ name: "linear_graphql" });
    expect(linearTool!.inputSchema.required).toContain("query");
  });

  it("includes github_api tool with correct schema", () => {
    const tools = buildDynamicTools(linearProvider, testLogger) as Array<{
      name: string;
      inputSchema: Record<string, unknown>;
    }>;
    const githubTool = tools.find((t) => t.name === "github_api");
    expect(githubTool).toMatchObject({ name: "github_api" });
    expect(githubTool!.inputSchema.required).toContain("action");
  });

  it("warns when a tracker tool provider declares a tool without a schema", () => {
    const logger = {
      ...testLogger,
      warn: vi.fn(),
    };
    const provider = { toolNames: ["linear_graphql", "unknown_tool"], handleToolCall: vi.fn() };

    const tools = buildDynamicTools(provider, logger);

    expect(tools).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledWith(
      { toolNames: ["unknown_tool"] },
      "tracker tool provider declared tools without schemas",
    );
  });
});
