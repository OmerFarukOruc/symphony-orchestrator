import { describe, expect, it, vi } from "vitest";
import type { PreflightConnection } from "../../src/agent-runner/preflight.js";
import { runPreflight } from "../../src/agent-runner/preflight.js";
import { createMockLogger } from "../helpers.js";

function mockConnection(
  impl?: (...args: unknown[]) => Promise<unknown>,
): PreflightConnection & { request: ReturnType<typeof vi.fn> } {
  return { request: impl ? vi.fn().mockImplementation(impl) : vi.fn() } as unknown as PreflightConnection & {
    request: ReturnType<typeof vi.fn>;
  };
}

describe("runPreflight", () => {
  const logger = createMockLogger();

  it("passes with empty command list", async () => {
    const connection = mockConnection();
    const result = await runPreflight(connection, [], logger);
    expect(result.passed).toBe(true);
    expect(connection.request).not.toHaveBeenCalled();
  });

  it("passes when all commands succeed", async () => {
    const connection = mockConnection(() => Promise.resolve({ exitCode: 0, output: "ok" }));
    const result = await runPreflight(connection, ["npm test", "npm run lint"], logger);
    expect(result.passed).toBe(true);
    expect(connection.request).toHaveBeenCalledTimes(2);
    expect(connection.request).toHaveBeenCalledWith("command/exec", { command: ["sh", "-lc", "npm test"] });
  });

  it("fails when a command returns non-zero exit code", async () => {
    const connection = mockConnection(() => Promise.resolve({ exitCode: 1, stdout: "test failed", stderr: "" }));
    const result = await runPreflight(connection, ["npm test"], logger);
    expect(result.passed).toBe(false);
    expect(result.failedCommand).toBe("npm test");
    expect(result.output).toBe("test failed");
  });

  it("fails when command/exec throws", async () => {
    const connection = mockConnection(() => Promise.reject(new Error("command/exec not supported")));
    const result = await runPreflight(connection, ["npm test"], logger);
    expect(result.passed).toBe(false);
    expect(result.failedCommand).toBe("npm test");
  });

  it("stops at first failing command", async () => {
    const connection = mockConnection();
    connection.request.mockResolvedValueOnce({ exitCode: 0 }).mockResolvedValueOnce({ exitCode: 1 });
    const result = await runPreflight(connection, ["cmd1", "cmd2", "cmd3"], logger);
    expect(result.passed).toBe(false);
    expect(result.failedCommand).toBe("cmd2");
    expect(connection.request).toHaveBeenCalledTimes(2); // cmd3 never called
  });
});
