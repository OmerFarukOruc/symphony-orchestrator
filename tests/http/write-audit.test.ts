import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { WriteAuditLog } from "../../src/http/write-audit.js";
import type { WriteAuditEntry } from "../../src/http/write-audit.js";

function makeEntry(overrides: Partial<WriteAuditEntry> = {}): WriteAuditEntry {
  return {
    at: "2024-06-01T00:00:00Z",
    method: "POST",
    path: "/api/v1/refresh",
    requestId: "req-1",
    remoteAddress: "127.0.0.1",
    statusCode: 202,
    ...overrides,
  };
}

describe("WriteAuditLog", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "audit-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates an instance with the given archiveDir", () => {
    const log = new WriteAuditLog(tempDir);
    expect(log).toBeInstanceOf(WriteAuditLog);
  });

  it("writes a single entry as NDJSON", async () => {
    const log = new WriteAuditLog(tempDir);
    const entry = makeEntry();
    await log.record(entry);

    const content = await readFile(path.join(tempDir, "write-audit.log"), "utf8");
    const lines = content.trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(entry);
  });

  it("creates the directory lazily on first write", async () => {
    const nestedDir = path.join(tempDir, "nested", "deep");
    const log = new WriteAuditLog(nestedDir);
    await log.record(makeEntry());

    const content = await readFile(path.join(nestedDir, "write-audit.log"), "utf8");
    expect(content).toContain('"method":"POST"');
  });

  it("appends multiple records to the same file", async () => {
    const log = new WriteAuditLog(tempDir);
    const first = makeEntry({ requestId: "req-1", statusCode: 200 });
    const second = makeEntry({ requestId: "req-2", statusCode: 204 });
    const third = makeEntry({ requestId: "req-3", statusCode: 500 });

    await log.record(first);
    await log.record(second);
    await log.record(third);

    const content = await readFile(path.join(tempDir, "write-audit.log"), "utf8");
    const lines = content.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).requestId).toBe("req-1");
    expect(JSON.parse(lines[1]).requestId).toBe("req-2");
    expect(JSON.parse(lines[2]).requestId).toBe("req-3");
  });

  it("preserves all entry fields in output", async () => {
    const log = new WriteAuditLog(tempDir);
    const entry = makeEntry({
      at: "2024-12-25T12:00:00Z",
      method: "DELETE",
      path: "/api/v1/MT-1/abort",
      requestId: undefined,
      remoteAddress: undefined,
      statusCode: 409,
    });
    await log.record(entry);

    const content = await readFile(path.join(tempDir, "write-audit.log"), "utf8");
    const parsed = JSON.parse(content.trimEnd());
    expect(parsed.at).toBe("2024-12-25T12:00:00Z");
    expect(parsed.method).toBe("DELETE");
    expect(parsed.path).toBe("/api/v1/MT-1/abort");
    expect(parsed.statusCode).toBe(409);
  });

  it("each line ends with a newline (NDJSON compliance)", async () => {
    const log = new WriteAuditLog(tempDir);
    await log.record(makeEntry());
    await log.record(makeEntry());

    const content = await readFile(path.join(tempDir, "write-audit.log"), "utf8");
    expect(content.endsWith("\n")).toBe(true);
    // Every line except the last empty split should be valid JSON
    const lines = content.split("\n").filter(Boolean);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
