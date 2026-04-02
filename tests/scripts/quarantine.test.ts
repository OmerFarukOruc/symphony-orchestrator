import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existsSyncMock: vi.fn<(filePath: string) => boolean>(),
  readFileSyncMock: vi.fn<(filePath: string, encoding: BufferEncoding) => string>(),
  renameSyncMock: vi.fn<(oldPath: string, newPath: string) => void>(),
  writeFileSyncMock: vi.fn<(filePath: string, data: string, encoding: BufferEncoding) => void>(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    existsSync: mocks.existsSyncMock,
    readFileSync: mocks.readFileSyncMock,
    renameSync: mocks.renameSyncMock,
    writeFileSync: mocks.writeFileSyncMock,
  };
});

import { HEAL_THRESHOLD, MAX_QUARANTINED, QUARANTINE_PATH, loadEntries } from "../../scripts/quarantine-shared.js";
import { healQuarantine } from "../../scripts/quarantine-heal.js";
import { addEntry, listEntries, removeEntry, runCli } from "../../scripts/quarantine.js";

interface EntryLike {
  testName: string;
  file: string;
  quarantinedAt?: string;
  passCount?: number;
}

function createEntry(overrides: EntryLike): EntryLike & { quarantinedAt: string; passCount: number } {
  return {
    quarantinedAt: "2026-04-01T00:00:00.000Z",
    passCount: 0,
    ...overrides,
  };
}

function setQuarantineEntries(entries: EntryLike[]): void {
  mocks.readFileSyncMock.mockImplementation((filePath) => {
    if (filePath === QUARANTINE_PATH) {
      return JSON.stringify(entries.map((entry) => createEntry(entry)));
    }

    throw new Error(`Unexpected read: ${filePath}`);
  });
}

function setHealInputs(entries: EntryLike[], resultsPath: string, resultsBody: object): void {
  mocks.readFileSyncMock.mockImplementation((filePath) => {
    if (filePath === QUARANTINE_PATH) {
      return JSON.stringify(entries.map((entry) => createEntry(entry)));
    }

    if (filePath === resultsPath) {
      return JSON.stringify(resultsBody);
    }

    throw new Error(`Unexpected read: ${filePath}`);
  });
}

function getSavedEntries(callIndex = 0): unknown {
  const call = mocks.writeFileSyncMock.mock.calls[callIndex];
  expect(call).toBeDefined();
  return JSON.parse(call[1].trim());
}

describe("quarantine scripts", () => {
  beforeEach(() => {
    process.exitCode = undefined;
    mocks.existsSyncMock.mockReset();
    mocks.readFileSyncMock.mockReset();
    mocks.renameSyncMock.mockReset();
    mocks.writeFileSyncMock.mockReset();
    vi.useRealTimers();
  });

  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  describe("addEntry", () => {
    it("adds a new quarantine entry", () => {
      const filePath = path.join("tests", "scripts", "sample.test.ts");
      const resolvedFilePath = path.resolve(filePath);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

      setQuarantineEntries([]);
      mocks.existsSyncMock.mockImplementation((candidatePath) => candidatePath === resolvedFilePath);

      addEntry("flaky test", filePath);

      expect(getSavedEntries()).toEqual([
        {
          file: filePath,
          passCount: 0,
          quarantinedAt: expect.any(String),
          testName: "flaky test",
        },
      ]);
      expect(logSpy).toHaveBeenCalledWith(`Quarantined: "flaky test" in ${filePath}`);
      expect(logSpy).toHaveBeenCalledWith(`Quarantine usage: 1/${MAX_QUARANTINED}`);
    });

    it("rejects duplicate test and file pairs", () => {
      const filePath = path.join("tests", "scripts", "sample.test.ts");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      setQuarantineEntries([{ testName: "flaky test", file: filePath }]);

      addEntry("flaky test", filePath);

      expect(mocks.writeFileSyncMock).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(`Error: Test "flaky test" in "${filePath}" is already quarantined.`);
      expect(process.exitCode).toBe(1);
    });

    it("rejects new entries when quarantine is at capacity", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      setQuarantineEntries(
        Array.from({ length: MAX_QUARANTINED }, (_, index) => ({
          testName: `test-${index}`,
          file: `tests/file-${index}.test.ts`,
        })),
      );

      addEntry("overflow test", "tests/scripts/overflow.test.ts");

      expect(mocks.writeFileSyncMock).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        `Error: Quarantine is at capacity (${MAX_QUARANTINED} tests). Remove an entry before adding a new one.`,
      );
      expect(process.exitCode).toBe(1);
    });

    it("rejects missing files", () => {
      const filePath = path.join("tests", "scripts", "missing.test.ts");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      setQuarantineEntries([]);
      mocks.existsSyncMock.mockReturnValue(false);

      addEntry("missing test", filePath);

      expect(mocks.writeFileSyncMock).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(`Error: File does not exist: ${filePath}`);
      expect(process.exitCode).toBe(1);
    });
  });

  describe("removeEntry", () => {
    it("removes an exact test and file match", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

      setQuarantineEntries([
        { testName: "shared name", file: "tests/a.test.ts" },
        { testName: "shared name", file: "tests/b.test.ts" },
      ]);

      removeEntry("shared name", "tests/b.test.ts");

      expect(getSavedEntries()).toEqual([
        {
          file: "tests/a.test.ts",
          passCount: 0,
          quarantinedAt: "2026-04-01T00:00:00.000Z",
          testName: "shared name",
        },
      ]);
      expect(logSpy).toHaveBeenCalledWith('Unquarantined: "shared name" from tests/b.test.ts');
      expect(logSpy).toHaveBeenCalledWith(`Quarantine usage: 1/${MAX_QUARANTINED}`);
    });

    it("keeps backward compatibility when a test name is unique", () => {
      setQuarantineEntries([{ testName: "unique test", file: "tests/unique.test.ts" }]);

      removeEntry("unique test");

      expect(getSavedEntries()).toEqual([]);
    });

    it("fails with an ambiguity error when multiple files share the same test name", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      setQuarantineEntries([
        { testName: "shared name", file: "tests/a.test.ts" },
        { testName: "shared name", file: "tests/b.test.ts" },
      ]);

      removeEntry("shared name");

      expect(mocks.writeFileSyncMock).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        'Error: Multiple quarantined entries found for "shared name". Re-run with --file <path>.',
      );
      expect(process.exitCode).toBe(1);
    });

    it("fails when the requested test is not quarantined", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      setQuarantineEntries([{ testName: "other test", file: "tests/other.test.ts" }]);

      removeEntry("missing test", "tests/missing.test.ts");

      expect(mocks.writeFileSyncMock).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        'Error: Test "missing test" in "tests/missing.test.ts" is not quarantined.',
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe("listEntries", () => {
    it("prints an empty state", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

      setQuarantineEntries([]);

      listEntries();

      expect(logSpy).toHaveBeenCalledWith("Quarantine is empty.");
    });

    it("prints populated quarantine details", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-03T00:00:00.000Z"));
      setQuarantineEntries([
        {
          testName: "listed test",
          file: "tests/listed.test.ts",
          passCount: 2,
          quarantinedAt: "2026-04-01T00:00:00.000Z",
        },
      ]);

      listEntries();

      expect(logSpy).toHaveBeenCalledWith(`Quarantined tests (1/${MAX_QUARANTINED}):\n`);
      expect(logSpy).toHaveBeenCalledWith('  - "listed test"');
      expect(logSpy).toHaveBeenCalledWith("    File: tests/listed.test.ts");
      expect(logSpy).toHaveBeenCalledWith(`    Quarantined: 2026-04-01T00:00:00.000Z (2d ago)`);
      expect(logSpy).toHaveBeenCalledWith(`    Pass count: 2/${HEAL_THRESHOLD}`);
    });
  });

  describe("loadEntries", () => {
    it("returns an empty list for malformed JSON", () => {
      mocks.readFileSyncMock.mockImplementation((filePath) => {
        if (filePath === QUARANTINE_PATH) {
          return "{";
        }

        throw new Error(`Unexpected read: ${filePath}`);
      });

      expect(loadEntries()).toEqual([]);
    });

    it("returns an empty list when the file is missing", () => {
      mocks.readFileSyncMock.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      expect(loadEntries()).toEqual([]);
    });
  });

  describe("healQuarantine", () => {
    it("increments passCount for passing tests below the heal threshold", () => {
      const resultsPath = path.resolve("reports/vitest-results.json");

      setHealInputs([{ testName: "flaky test", file: "tests/heal.test.ts", passCount: 1 }], resultsPath, {
        testResults: [
          {
            filepath: "tests/heal.test.ts",
            tests: [{ name: "flaky test", status: "passed" }],
          },
        ],
      });
      mocks.existsSyncMock.mockImplementation((filePath) =>
        [resultsPath, path.resolve("tests/heal.test.ts")].includes(filePath),
      );

      healQuarantine(resultsPath);

      expect(getSavedEntries(0)).toEqual([
        {
          file: "tests/heal.test.ts",
          passCount: 2,
          quarantinedAt: "2026-04-01T00:00:00.000Z",
          testName: "flaky test",
        },
      ]);
      expect(mocks.renameSyncMock).toHaveBeenCalledWith(`${QUARANTINE_PATH}.tmp`, QUARANTINE_PATH);
    });

    it("resets passCount to zero after a failing run", () => {
      const resultsPath = path.resolve("reports/vitest-results.json");

      setHealInputs([{ testName: "flaky test", file: "tests/heal.test.ts", passCount: 4 }], resultsPath, {
        testResults: [
          {
            filepath: "tests/heal.test.ts",
            tests: [{ name: "flaky test", status: "failed" }],
          },
        ],
      });
      mocks.existsSyncMock.mockImplementation((filePath) =>
        [resultsPath, path.resolve("tests/heal.test.ts")].includes(filePath),
      );

      healQuarantine(resultsPath);

      expect(getSavedEntries(0)).toEqual([
        {
          file: "tests/heal.test.ts",
          passCount: 0,
          quarantinedAt: "2026-04-01T00:00:00.000Z",
          testName: "flaky test",
        },
      ]);
    });

    it("removes entries that reach the heal threshold", () => {
      const resultsPath = path.resolve("reports/vitest-results.json");

      setHealInputs(
        [{ testName: "flaky test", file: "tests/heal.test.ts", passCount: HEAL_THRESHOLD - 1 }],
        resultsPath,
        {
          testResults: [
            {
              filepath: "tests/heal.test.ts",
              tests: [{ name: "flaky test", status: "passed" }],
            },
          ],
        },
      );
      mocks.existsSyncMock.mockImplementation((filePath) =>
        [resultsPath, path.resolve("tests/heal.test.ts")].includes(filePath),
      );

      healQuarantine(resultsPath);

      expect(getSavedEntries(0)).toEqual([]);
    });

    it("removes stale entries whose files no longer exist", () => {
      const resultsPath = path.resolve("reports/vitest-results.json");

      setHealInputs([{ testName: "stale test", file: "tests/stale.test.ts", passCount: 2 }], resultsPath, {
        testResults: [],
      });
      mocks.existsSyncMock.mockImplementation((filePath) => filePath === resultsPath);

      healQuarantine(resultsPath);

      expect(getSavedEntries(0)).toEqual([]);
    });
  });

  describe("runCli", () => {
    it("prints the updated remove usage", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      runCli(["remove"]);

      expect(errorSpy).toHaveBeenCalledWith(
        "Usage: npx tsx scripts/quarantine.ts remove --test <name> [--file <path>]",
      );
      expect(process.exitCode).toBe(1);
    });

    it("prints help text that explains the file disambiguation rule", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      runCli([]);

      expect(errorSpy).toHaveBeenCalledWith(
        "  remove --test <name> [--file <path>]       Remove a test from quarantine",
      );
      expect(errorSpy).toHaveBeenCalledWith(
        "                                              --file is required when the same test name appears in multiple files",
      );
      expect(process.exitCode).toBe(1);
    });
  });
});
