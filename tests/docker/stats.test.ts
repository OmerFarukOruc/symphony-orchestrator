import { describe, expect, it, vi } from "vitest";
import { getContainerStats } from "../../src/docker/stats.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";

const mockExecFile = vi.mocked(execFile);

function simulateExecFile(stdout: string, error?: Error): void {
  mockExecFile.mockImplementation((_cmd, _args, callback) => {
    if (error) {
      (callback as (err: Error) => void)(error);
    } else {
      (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout,
        stderr: "",
      });
    }
    return {} as ReturnType<typeof execFile>;
  });
}

describe("getContainerStats", () => {
  it("parses valid docker stats JSON output", async () => {
    simulateExecFile('{"cpu":"12.50%","mem":"256MiB / 4GiB","memPerc":"6.25%","net":"1.2kB / 0B","pids":"15"}\n');

    const stats = await getContainerStats("risoluto-test");
    expect(stats).not.toBeNull();
    expect(stats!.cpuPercent).toBe("12.50%");
    expect(stats!.memoryUsage).toBe("256MiB");
    expect(stats!.memoryLimit).toBe("4GiB");
    expect(stats!.memoryPercent).toBe("6.25%");
    expect(stats!.netIO).toBe("1.2kB / 0B");
    expect(stats!.pids).toBe("15");
  });

  it("returns null when docker stats fails", async () => {
    simulateExecFile("", new Error("container not found"));

    const stats = await getContainerStats("nonexistent");
    expect(stats).toBeNull();
  });

  it("returns null when output is empty", async () => {
    simulateExecFile("");

    const stats = await getContainerStats("stopped-container");
    expect(stats).toBeNull();
  });
});
