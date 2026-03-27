import type { ChildProcessWithoutNullStreams } from "node:child_process";

import {
  createErrorResponse,
  createRequest,
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcSuccessResponse,
  type JsonRpcId,
  type JsonRpcRequest,
} from "../codex/protocol.js";
import type { SymphonyLogger } from "../core/types.js";
import { toErrorString } from "../utils/type-guards.js";

const MAX_LINE_BYTES = 10 * 1024 * 1024;

export class JsonRpcTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonRpcTimeoutError";
  }
}

export class JsonRpcConnection {
  private buffer = "";
  private readonly pending = new Map<
    JsonRpcId,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private _exited = false;

  get exited(): boolean {
    return this._exited;
  }

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly logger: SymphonyLogger,
    private readonly timeoutMs: number,
    private readonly onRequest: (request: JsonRpcRequest) => Promise<void>,
    private readonly onNotification?: (message: { method: string; params?: unknown }) => void,
  ) {
    child.stdout.on("data", (chunk: Buffer) => {
      this.onChunk(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.logger.warn({ stderr: chunk.toString().trim() || null }, "codex stderr");
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EPIPE" || error.code === "ERR_STREAM_DESTROYED") {
        this.logger.debug({ error: error.code }, "stdin write failed (child exited)");
        return;
      }
      this.logger.error({ error: toErrorString(error) }, "unexpected stdin error");
    });
    child.on("exit", () => {
      this._exited = true;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`connection exited while waiting for request ${id}`));
      }
      this.pending.clear();
    });
  }

  close(): void {
    if (!this._exited) {
      this.child.kill("SIGTERM");
    }
  }

  async interruptTurn(threadId: string, turnId: string, timeoutMs = 3000): Promise<boolean> {
    if (this._exited) return false;
    try {
      await Promise.race([
        this.request("turn/interrupt", { threadId, turnId }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("interrupt timeout")), timeoutMs)),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  notify(method: string, params: unknown): void {
    if (this._exited) {
      return;
    }
    this.send({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    if (this._exited) {
      return Promise.reject(new Error("connection already exited"));
    }
    const request = createRequest(method, params);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new JsonRpcTimeoutError(`timed out waiting for ${method}`));
      }, this.timeoutMs);

      this.pending.set(request.id, { resolve, reject, timer });
      this.send(request);
    });
  }

  private send(message: unknown): void {
    if (this._exited) {
      return;
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private onChunk(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    if (Buffer.byteLength(this.buffer, "utf8") > MAX_LINE_BYTES) {
      this.logger.error({ maxLineBytes: MAX_LINE_BYTES }, "codex line exceeded maximum size");
      this.close();
      return;
    }

    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        this.onLine(line);
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private onLine(line: string): void {
    if (line.startsWith("symphony:")) {
      this.logger.debug({ line }, "container sentinel");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      this.logger.warn({ line, error: toErrorString(error) }, "non-JSON line from codex");
      return;
    }

    if (isJsonRpcSuccessResponse(parsed)) {
      const pending = this.pending.get(parsed.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(parsed.id);
        pending.resolve(parsed.result);
      }
      return;
    }

    if (isJsonRpcErrorResponse(parsed)) {
      const pending = this.pending.get(parsed.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(parsed.id);
        pending.reject(new Error(parsed.error.message));
      }
      return;
    }

    if (isJsonRpcRequest(parsed)) {
      void this.onRequest(parsed).catch((error) => {
        this.logger.error({ method: parsed.method, error: toErrorString(error) }, "failed to handle codex request");
        this.send(createErrorResponse(parsed.id, toErrorString(error)));
      });
      return;
    }

    if (isJsonRpcNotification(parsed)) {
      this.logger.debug({ method: parsed.method, params: parsed.params ?? null }, "codex notification");
      this.onNotification?.(parsed);
    }
  }
}
