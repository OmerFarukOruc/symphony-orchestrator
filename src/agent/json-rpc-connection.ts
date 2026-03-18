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
  private exited = false;

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
    child.on("exit", () => {
      this.exited = true;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`connection exited while waiting for request ${id}`));
      }
      this.pending.clear();
    });
  }

  close(): void {
    if (!this.exited) {
      this.child.kill("SIGTERM");
    }
  }

  notify(method: string, params: unknown): void {
    this.send({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      this.logger.error({ line, error: String(error) }, "invalid json from codex");
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
        this.logger.error({ method: parsed.method, error: String(error) }, "failed to handle codex request");
        this.send(createErrorResponse(parsed.id, error instanceof Error ? error.message : String(error)));
      });
      return;
    }

    if (isJsonRpcNotification(parsed)) {
      this.logger.debug({ method: parsed.method, params: parsed.params ?? null }, "codex notification");
      this.onNotification?.(parsed);
    }
  }
}
