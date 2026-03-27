import { describe, expect, it, vi } from "vitest";
import { compactThread } from "../../src/agent-runner/thread-compact.js";
import type { JsonRpcConnection } from "../../src/agent/json-rpc-connection.js";
import { createMockLogger } from "../helpers.js";

function makeConnection(shouldReject = false): JsonRpcConnection {
  return {
    request: shouldReject ? vi.fn().mockRejectedValue(new Error("compact failed")) : vi.fn().mockResolvedValue({}),
  } as unknown as JsonRpcConnection;
}

describe("compactThread", () => {
  it("returns true and logs on successful compaction", async () => {
    const connection = makeConnection();
    const logger = createMockLogger();

    const result = await compactThread(connection, "thread-1", logger);

    expect(result).toBe(true);
    expect(connection.request).toHaveBeenCalledWith("thread/compact/start", { threadId: "thread-1" });
    expect(logger.info).toHaveBeenCalledWith({ threadId: "thread-1" }, "thread compacted successfully");
  });

  it("returns false and logs warning when compaction fails", async () => {
    const connection = makeConnection(true);
    const logger = createMockLogger();

    const result = await compactThread(connection, "thread-2", logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      { error: "compact failed", threadId: "thread-2" },
      "thread/compact/start failed",
    );
  });
});
