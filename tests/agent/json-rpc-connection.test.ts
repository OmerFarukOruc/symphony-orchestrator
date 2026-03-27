import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JsonRpcConnection, JsonRpcTimeoutError } from "../../src/agent/json-rpc-connection.js";
import type { JsonRpcRequest } from "../../src/codex/protocol.js";
import { createMockLogger } from "../helpers.js";

/**
 * Creates a mock ChildProcessWithoutNullStreams using EventEmitter-based streams.
 * stdin captures writes; stdout/stderr emit data events.
 */
function makeMockChild() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = Object.assign(new EventEmitter(), {
    write: vi.fn(),
  });
  const child = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin,
    kill: vi.fn(),
    pid: 12345,
  });
  return {
    child: child as unknown as import("node:child_process").ChildProcessWithoutNullStreams,
    stdout,
    stderr,
    stdin,
    sendLine(json: unknown): void {
      stdout.emit("data", Buffer.from(JSON.stringify(json) + "\n"));
    },
    sendRaw(text: string): void {
      stdout.emit("data", Buffer.from(text));
    },
    exit(): void {
      child.emit("exit");
    },
    kill: child.kill,
  };
}

/** Parse the last JSON-RPC message written to the mock child's stdin. */
function lastSentMessage(mock: ReturnType<typeof makeMockChild>): Record<string, unknown> {
  const raw = mock.child.stdin.write.mock.calls.at(-1)?.[0] as string;
  return JSON.parse(raw.trim()) as Record<string, unknown>;
}

describe("JsonRpcConnection", () => {
  let logger: ReturnType<typeof createMockLogger>;
  let onRequest: ReturnType<typeof vi.fn>;
  let onNotification: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = createMockLogger();
    onRequest = vi.fn().mockResolvedValue(undefined);
    onNotification = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createConnection(mock: ReturnType<typeof makeMockChild>, timeoutMs = 5000): JsonRpcConnection {
    return new JsonRpcConnection(mock.child, logger, timeoutMs, onRequest, onNotification);
  }

  describe("line-buffered JSON-RPC parsing", () => {
    it("parses a complete JSON-RPC success response", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      const promise = conn.request("test/method", { key: "value" });
      const sent = lastSentMessage(mock);

      mock.sendLine({ jsonrpc: "2.0", id: sent.id, result: { ok: true } });
      const result = await promise;
      expect(result).toEqual({ ok: true });
    });

    it("handles data arriving in multiple chunks", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      const promise = conn.request("test/chunked", {});
      const sent = lastSentMessage(mock);

      const fullResponse = JSON.stringify({ jsonrpc: "2.0", id: sent.id, result: "chunked" });
      const midpoint = Math.floor(fullResponse.length / 2);
      mock.sendRaw(fullResponse.slice(0, midpoint));
      mock.sendRaw(fullResponse.slice(midpoint) + "\n");

      const result = await promise;
      expect(result).toBe("chunked");
    });

    it("handles multiple messages in a single chunk", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      const promise1 = conn.request("test/first", {});
      const id1 = lastSentMessage(mock).id;

      const promise2 = conn.request("test/second", {});
      const id2 = lastSentMessage(mock).id;

      const combined =
        JSON.stringify({ jsonrpc: "2.0", id: id1, result: "first" }) +
        "\n" +
        JSON.stringify({ jsonrpc: "2.0", id: id2, result: "second" }) +
        "\n";
      mock.sendRaw(combined);

      expect(await promise1).toBe("first");
      expect(await promise2).toBe("second");
    });

    it("skips empty lines between messages", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      const promise = conn.request("test/skipblanks", {});
      const sent = lastSentMessage(mock);

      mock.sendRaw("\n\n" + JSON.stringify({ jsonrpc: "2.0", id: sent.id, result: "ok" }) + "\n\n");
      expect(await promise).toBe("ok");
    });

    it("logs error for invalid JSON and does not crash", () => {
      const mock = makeMockChild();
      createConnection(mock);

      mock.sendRaw("this-is-not-json\n");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ line: "this-is-not-json" }),
        expect.stringContaining("invalid json"),
      );
    });
  });

  describe("response routing", () => {
    it("resolves pending request on success response", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      const promise = conn.request("resolve/test", {});
      const sent = lastSentMessage(mock);

      mock.sendLine({ jsonrpc: "2.0", id: sent.id, result: 42 });
      expect(await promise).toBe(42);
    });

    it("ignores success response with unknown id without crashing", () => {
      const mock = makeMockChild();
      createConnection(mock);

      mock.sendLine({ jsonrpc: "2.0", id: 99999, result: "orphan" });
      // No error should be logged for an orphaned success response
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("error routing", () => {
    it("rejects pending request on error response", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      const promise = conn.request("error/test", {});
      const sent = lastSentMessage(mock);

      mock.sendLine({
        jsonrpc: "2.0",
        id: sent.id,
        error: { code: -32600, message: "invalid request" },
      });

      await expect(promise).rejects.toThrow("invalid request");
    });

    it("ignores error response with unknown id without crashing", () => {
      const mock = makeMockChild();
      createConnection(mock);

      mock.sendLine({
        jsonrpc: "2.0",
        id: 99999,
        error: { code: -32600, message: "orphan error" },
      });
      // No fatal error should be logged for an orphaned error response
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("request handling", () => {
    it("invokes onRequest for incoming JSON-RPC requests", async () => {
      const mock = makeMockChild();
      createConnection(mock);

      const incomingRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: 100,
        method: "item/tool/call",
        params: { name: "linear_graphql" },
      };
      mock.sendLine(incomingRequest);

      await vi.advanceTimersByTimeAsync(0);
      expect(onRequest).toHaveBeenCalledWith(incomingRequest);
    });

    it("sends error response when onRequest handler throws", async () => {
      onRequest.mockRejectedValueOnce(new Error("handler blew up"));
      const mock = makeMockChild();
      createConnection(mock);

      mock.sendLine({ jsonrpc: "2.0", id: 200, method: "bad/method", params: {} });
      await vi.advanceTimersByTimeAsync(0);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ method: "bad/method" }),
        expect.stringContaining("failed to handle"),
      );
      const errorWrite = mock.child.stdin.write.mock.calls.find((call: unknown[]) => {
        const parsed = JSON.parse(call[0] as string);
        return parsed.id === 200 && parsed.error;
      });
      expect(errorWrite).toBeDefined();
      const errorMsg = JSON.parse(errorWrite[0] as string);
      expect(errorMsg.error.message).toBe("handler blew up");
    });
  });

  describe("notification handling", () => {
    it("invokes onNotification for incoming notifications", () => {
      const mock = makeMockChild();
      createConnection(mock);

      mock.sendLine({ jsonrpc: "2.0", method: "status/update", params: { status: "running" } });
      expect(onNotification).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        method: "status/update",
        params: { status: "running" },
      });
    });

    it("logs notifications even without onNotification callback", () => {
      const mock = makeMockChild();
      // Create connection without onNotification callback
      const conn = new JsonRpcConnection(mock.child, logger, 5000, onRequest);

      mock.sendLine({ jsonrpc: "2.0", method: "log/info", params: { text: "hello" } });
      expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ method: "log/info" }), expect.any(String));
      expect(conn).toBeDefined();
    });
  });

  describe("timeout handling", () => {
    it("rejects with JsonRpcTimeoutError when response is not received in time", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock, 1000);

      const promise = conn.request("slow/method", {});
      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow(JsonRpcTimeoutError);
      await expect(promise).rejects.toThrow("timed out waiting for slow/method");
    });

    it("clears timeout when response arrives before deadline", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock, 5000);

      const promise = conn.request("fast/method", {});
      const sent = lastSentMessage(mock);

      vi.advanceTimersByTime(100);
      mock.sendLine({ jsonrpc: "2.0", id: sent.id, result: "fast" });

      const result = await promise;
      expect(result).toBe("fast");

      // Advancing past the original timeout should not cause issues
      vi.advanceTimersByTime(10000);
    });
  });

  describe("MAX_LINE_BYTES enforcement", () => {
    it("closes connection when a line exceeds the size limit", () => {
      const mock = makeMockChild();
      createConnection(mock);

      const oversizedData = "x".repeat(11 * 1024 * 1024);
      mock.sendRaw(oversizedData);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ maxLineBytes: 10 * 1024 * 1024 }),
        expect.stringContaining("exceeded maximum size"),
      );
      expect(mock.kill).toHaveBeenCalledWith("SIGTERM");
    });
  });

  describe("graceful exit cleanup", () => {
    it("rejects all pending requests when child exits", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      const promise1 = conn.request("pending/one", {});
      const promise2 = conn.request("pending/two", {});

      mock.exit();

      await expect(promise1).rejects.toThrow("connection exited");
      await expect(promise2).rejects.toThrow("connection exited");
    });

    it("rejects new requests after exit", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      mock.exit();
      await expect(conn.request("post/exit", {})).rejects.toThrow("connection already exited");
    });

    it("does not send notifications after exit", () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      mock.exit();
      conn.notify("noop/after-exit", {});
      // The write call count should only include writes from before exit
      const postExitWrites = mock.child.stdin.write.mock.calls.length;
      conn.notify("noop/after-exit2", {});
      expect(mock.child.stdin.write.mock.calls.length).toBe(postExitWrites);
    });
  });

  describe("close()", () => {
    it("sends SIGTERM to child process", () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      conn.close();
      expect(mock.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("does not send SIGTERM if already exited", () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      mock.exit();
      conn.close();
      expect(mock.kill).not.toHaveBeenCalled();
    });
  });

  describe("notify()", () => {
    it("sends a JSON-RPC notification without id", () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      conn.notify("test/notify", { data: "hello" });
      const sent = lastSentMessage(mock);

      expect(sent.jsonrpc).toBe("2.0");
      expect(sent.method).toBe("test/notify");
      expect(sent.params).toEqual({ data: "hello" });
      expect(sent.id).toBeUndefined();
    });
  });

  describe("stderr handling", () => {
    it("logs stderr output as warnings", () => {
      const mock = makeMockChild();
      createConnection(mock);

      mock.stderr.emit("data", Buffer.from("something went wrong\n"));
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ stderr: "something went wrong" }),
        "codex stderr",
      );
    });
  });

  describe("exited getter", () => {
    it("returns false initially", () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);
      expect(conn.exited).toBe(false);
    });

    it("returns true after child process exits", () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);
      mock.exit();
      expect(conn.exited).toBe(true);
    });

    it("returns true after close() is called", () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);
      // close() sends SIGTERM; simulate the exit event that follows
      conn.close();
      mock.exit();
      expect(conn.exited).toBe(true);
    });
  });

  describe("interruptTurn()", () => {
    it("sends turn/interrupt request and returns true on success", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      const promise = conn.interruptTurn("thread-1", "turn-1", 5000);

      // The interruptTurn method calls request(), which writes to stdin
      const sent = lastSentMessage(mock);
      expect(sent.method).toBe("turn/interrupt");
      expect(sent.params).toEqual({ threadId: "thread-1", turnId: "turn-1" });

      // Respond successfully
      mock.sendLine({ jsonrpc: "2.0", id: sent.id, result: {} });
      const result = await promise;
      expect(result).toBe(true);
    });

    it("returns false when the request times out", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      const promise = conn.interruptTurn("thread-1", "turn-1", 500);

      // Do not respond — let the interrupt timeout fire
      vi.advanceTimersByTime(501);
      const result = await promise;
      expect(result).toBe(false);
    });

    it("returns false immediately when connection already exited", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      mock.exit();
      const result = await conn.interruptTurn("thread-1", "turn-1");
      expect(result).toBe(false);
      // No new writes should have been sent after exit
      const writesAfterExit = mock.child.stdin.write.mock.calls.length;
      expect(writesAfterExit).toBe(0);
    });

    it("returns false when the request rejects with an error", async () => {
      const mock = makeMockChild();
      const conn = createConnection(mock);

      const promise = conn.interruptTurn("thread-1", "turn-1", 5000);
      const sent = lastSentMessage(mock);

      // Respond with a JSON-RPC error
      mock.sendLine({
        jsonrpc: "2.0",
        id: sent.id,
        error: { code: -32600, message: "not supported" },
      });
      const result = await promise;
      expect(result).toBe(false);
    });
  });

  describe("stdin error handling", () => {
    it("logs EPIPE as debug (child already exited)", () => {
      const mock = makeMockChild();
      createConnection(mock);

      const epipeError = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
      mock.stdin.emit("error", epipeError);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ error: "EPIPE" }),
        expect.stringContaining("stdin write failed"),
      );
    });

    it("logs ERR_STREAM_DESTROYED as debug", () => {
      const mock = makeMockChild();
      createConnection(mock);

      const destroyedError = Object.assign(new Error("stream destroyed"), {
        code: "ERR_STREAM_DESTROYED",
      });
      mock.stdin.emit("error", destroyedError);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ERR_STREAM_DESTROYED" }),
        expect.stringContaining("stdin write failed"),
      );
    });

    it("logs unexpected stdin errors as error level", () => {
      const mock = makeMockChild();
      createConnection(mock);

      const weirdError = Object.assign(new Error("something unexpected"), { code: "ENOENT" });
      mock.stdin.emit("error", weirdError);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining("something unexpected") }),
        expect.stringContaining("unexpected stdin error"),
      );
    });
  });
});
