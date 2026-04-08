import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedExecFileAsync, mockedSpawn } = vi.hoisted(() => ({
  mockedExecFileAsync: vi.fn(),
  mockedSpawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  spawn: (...args: unknown[]) => mockedSpawn(...args),
}));
vi.mock("node:util", () => ({
  promisify: () => mockedExecFileAsync,
}));

import { generatePrSummary } from "../../src/git/pr-summary-generator.js";

function makeChild(lines: string[] = [], errorEvent = false) {
  const stdoutHandlers = new Map<string, (chunk: Buffer) => void>();
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const child = {
    stdout: {
      on: vi.fn((event: string, handler: (chunk: Buffer) => void) => {
        stdoutHandlers.set(event, handler);
      }),
    },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    kill: vi.fn(),
    killed: false,
  };

  queueMicrotask(() => {
    if (errorEvent) {
      handlers.get("error")?.(new Error("spawn failed"));
      return;
    }
    for (const line of lines) {
      stdoutHandlers.get("data")?.(Buffer.from(`${line}\n`, "utf8"));
    }
    handlers.get("exit")?.(0);
  });

  return child;
}

describe("generatePrSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when git diff is empty", async () => {
    mockedExecFileAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

    await expect(generatePrSummary("/tmp/ws", "main")).resolves.toBeNull();
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it("returns null when the diff exceeds the max size", async () => {
    mockedExecFileAsync.mockResolvedValueOnce({ stdout: "a".repeat(60 * 1024), stderr: "" });

    await expect(generatePrSummary("/tmp/ws", "main")).resolves.toBeNull();
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it("returns a markdown bullet summary from codex json output", async () => {
    mockedExecFileAsync.mockResolvedValueOnce({ stdout: "diff --git a/file b/file\n+change\n", stderr: "" });
    mockedSpawn.mockImplementationOnce(() =>
      makeChild([
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "- updated file handling" } }),
      ]),
    );

    await expect(generatePrSummary("/tmp/ws", "main")).resolves.toBe("- updated file handling");
    expect(mockedSpawn).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining(["exec", expect.any(String), "--json", "-s", "read-only"]),
      expect.objectContaining({ cwd: "/tmp/ws" }),
    );
  });

  it("returns null when codex output is not markdown bullets", async () => {
    mockedExecFileAsync.mockResolvedValueOnce({ stdout: "diff --git a/file b/file\n+change\n", stderr: "" });
    mockedSpawn.mockImplementationOnce(() =>
      makeChild([
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "summary without bullets" } }),
      ]),
    );

    await expect(generatePrSummary("/tmp/ws", "main")).resolves.toBeNull();
  });

  it("returns null when codex process errors", async () => {
    mockedExecFileAsync.mockResolvedValueOnce({ stdout: "diff --git a/file b/file\n+change\n", stderr: "" });
    mockedSpawn.mockImplementationOnce(() => makeChild([], true));

    await expect(generatePrSummary("/tmp/ws", "main")).resolves.toBeNull();
  });
});
