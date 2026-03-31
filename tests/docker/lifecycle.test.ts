import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";

import {
  inspectContainerRunning,
  inspectOomKilled,
  removeContainer,
  removeVolume,
  stopContainer,
} from "../../src/docker/lifecycle.js";

const mockExecFile = vi.mocked(execFile);

type ExecFileResult = {
  stdout: string;
  stderr: string;
};

type ExecFileCallback = (error: Error | null, result?: ExecFileResult) => void;

function simulateExecFileSuccess(stdout = "", stderr = ""): void {
  mockExecFile.mockImplementation((_command, _args, callback) => {
    (callback as ExecFileCallback)(null, { stdout, stderr });
    return {} as ReturnType<typeof execFile>;
  });
}

function simulateExecFileError(error: Error): void {
  mockExecFile.mockImplementation((_command, _args, callback) => {
    (callback as ExecFileCallback)(error);
    return {} as ReturnType<typeof execFile>;
  });
}

function createExecError(message: string, stderr: string): Error & { stderr: string } {
  return Object.assign(new Error(message), { stderr });
}

describe("docker lifecycle helpers", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  describe("stopContainer", () => {
    it("stops a container successfully", async () => {
      simulateExecFileSuccess();

      await expect(stopContainer("risoluto-test", 10)).resolves.toBeUndefined();

      expect(mockExecFile).toHaveBeenCalledWith(
        "docker",
        ["stop", "--time", "10", "risoluto-test"],
        expect.any(Function),
      );
    });

    it("swallows docker not-found errors", async () => {
      simulateExecFileError(
        createExecError("container missing", "Error response from daemon: No such container: risoluto-missing"),
      );

      await expect(stopContainer("risoluto-missing")).resolves.toBeUndefined();

      expect(mockExecFile).toHaveBeenCalledWith(
        "docker",
        ["stop", "--time", "5", "risoluto-missing"],
        expect.any(Function),
      );
    });

    it("rethrows non-not-found errors", async () => {
      const error = createExecError("docker failed", "permission denied");
      simulateExecFileError(error);

      await expect(stopContainer("risoluto-test")).rejects.toBe(error);
    });
  });

  describe("removeContainer", () => {
    it("removes a container successfully", async () => {
      simulateExecFileSuccess();

      await expect(removeContainer("risoluto-test")).resolves.toBeUndefined();

      expect(mockExecFile).toHaveBeenCalledWith("docker", ["rm", "-f", "risoluto-test"], expect.any(Function));
    });

    it("swallows missing-container errors", async () => {
      simulateExecFileError(
        createExecError("container missing", "Error response from daemon: No such container: risoluto-missing"),
      );

      await expect(removeContainer("risoluto-missing")).resolves.toBeUndefined();
    });

    it("rethrows non-not-found errors", async () => {
      const error = createExecError("docker failed", "permission denied");
      simulateExecFileError(error);

      await expect(removeContainer("risoluto-test")).rejects.toBe(error);
    });
  });

  describe("removeVolume", () => {
    it("removes a volume successfully", async () => {
      simulateExecFileSuccess();

      await expect(removeVolume("risoluto-cache")).resolves.toBeUndefined();

      expect(mockExecFile).toHaveBeenCalledWith(
        "docker",
        ["volume", "rm", "-f", "risoluto-cache"],
        expect.any(Function),
      );
    });

    it("swallows missing-volume errors", async () => {
      simulateExecFileError(
        createExecError("volume missing", "Error response from daemon: No such volume: risoluto-cache-missing"),
      );

      await expect(removeVolume("risoluto-cache-missing")).resolves.toBeUndefined();
    });

    it("rethrows non-not-found errors", async () => {
      const error = createExecError("docker failed", "volume is in use");
      simulateExecFileError(error);

      await expect(removeVolume("risoluto-cache")).rejects.toBe(error);
    });
  });

  describe("inspectOomKilled", () => {
    it("returns true when docker reports OOMKilled=true", async () => {
      simulateExecFileSuccess("true\n");

      await expect(inspectOomKilled("risoluto-test")).resolves.toBe(true);

      expect(mockExecFile).toHaveBeenCalledWith(
        "docker",
        ["inspect", "risoluto-test", "--format", "{{.State.OOMKilled}}"],
        expect.any(Function),
      );
    });

    it("returns false when docker reports OOMKilled=false", async () => {
      simulateExecFileSuccess("false\n");

      await expect(inspectOomKilled("risoluto-test")).resolves.toBe(false);
    });

    it("returns null when the container does not exist", async () => {
      simulateExecFileError(
        createExecError("container missing", "Error response from daemon: No such container: risoluto-missing"),
      );

      await expect(inspectOomKilled("risoluto-missing")).resolves.toBeNull();
    });

    it("rethrows non-not-found errors", async () => {
      const error = createExecError("docker failed", "Cannot connect to the Docker daemon");
      simulateExecFileError(error);

      await expect(inspectOomKilled("risoluto-test")).rejects.toBe(error);
    });
  });

  describe("inspectContainerRunning", () => {
    it("returns true when docker reports Running=true", async () => {
      simulateExecFileSuccess("true\n");

      await expect(inspectContainerRunning("risoluto-test")).resolves.toBe(true);

      expect(mockExecFile).toHaveBeenCalledWith(
        "docker",
        ["inspect", "risoluto-test", "--format", "{{.State.Running}}"],
        expect.any(Function),
      );
    });

    it("returns false when docker reports Running=false", async () => {
      simulateExecFileSuccess("false\n");

      await expect(inspectContainerRunning("risoluto-test")).resolves.toBe(false);
    });

    it("returns null when the container does not exist", async () => {
      simulateExecFileError(
        createExecError("container missing", "Error response from daemon: No such container: risoluto-missing"),
      );

      await expect(inspectContainerRunning("risoluto-missing")).resolves.toBeNull();
    });
  });
});
