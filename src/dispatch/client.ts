import { getRequiredProviderEnvNames, prepareCodexRuntimeConfig } from "../codex/runtime-config.js";
import { outcomeForAbort } from "../agent-runner/abort-outcomes.js";
import type { ServiceConfig, RisolutoLogger, Issue, ModelSelection, Workspace, RunOutcome } from "../core/types.js";
import type { AgentRunnerEventHandler } from "../agent-runner/contracts.js";
import type { DispatchRequest, DispatchStreamMessage, RunAttemptDispatcher } from "./types.js";
import { toErrorString } from "../utils/type-guards.js";

interface DispatchClientDeps {
  dispatchUrl: string;
  secret: string;
  getConfig: () => ServiceConfig;
  logger: RisolutoLogger;
}

/**
 * Control plane client that dispatches runAttempt to a remote data plane.
 * Implements the same RunAttemptDispatcher interface as AgentRunner,
 * so it can be used as a drop-in replacement.
 */
export class DispatchClient implements RunAttemptDispatcher {
  constructor(private readonly deps: DispatchClientDeps) {}

  async runAttempt(input: {
    issue: Issue;
    attempt: number | null;
    modelSelection: ModelSelection;
    promptTemplate: string;
    workspace: Workspace;
    signal: AbortSignal;
    onEvent: AgentRunnerEventHandler;
  }): Promise<RunOutcome> {
    const config = this.deps.getConfig();
    const logger = this.deps.logger.child({
      issueIdentifier: input.issue.identifier,
      dispatchUrl: this.deps.dispatchUrl,
    });

    let abortForwarding: Promise<void> | null = null;
    const forwardAbort = () => {
      abortForwarding = this.abortRun(input.issue.id, logger).catch((error: unknown) => {
        logger.warn({ runId: input.issue.id, error: toErrorString(error) }, "Dispatch abort request failed");
      });
    };

    input.signal.addEventListener("abort", forwardAbort, { once: true });
    const dispatchRequest = await this.buildDispatchRequest(input, config);
    if (input.signal.aborted && !abortForwarding) {
      forwardAbort();
    }

    try {
      logger.debug({ runId: input.issue.id }, "Dispatching runAttempt to data plane");

      const response = await this.sendDispatchRequest(dispatchRequest, input.signal);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, error: errorText }, "Dispatch request failed");
        throw new Error(`Dispatch request failed: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error("Dispatch response has no body");
      }

      return await parseDispatchStream(response.body, input.onEvent, logger);
    } catch (error) {
      if (input.signal.aborted) {
        if (abortForwarding) {
          await abortForwarding;
        }
        logger.info({ runId: input.issue.id, reason: String(input.signal.reason ?? "aborted") }, "Dispatch aborted");
        return outcomeForAbort(input.signal, null, null, 0);
      }
      throw error;
    } finally {
      input.signal.removeEventListener("abort", forwardAbort);
    }
  }

  private async buildDispatchRequest(
    input: {
      issue: Issue;
      attempt: number | null;
      modelSelection: ModelSelection;
      promptTemplate: string;
      workspace: Workspace;
    },
    config: ServiceConfig,
  ): Promise<DispatchRequest> {
    const { configToml, authJsonBase64 } = await prepareCodexRuntimeConfig(config.codex);
    const requiredEnvNames = getRequiredProviderEnvNames(config.codex);

    return {
      issue: input.issue,
      attempt: input.attempt,
      modelSelection: input.modelSelection,
      promptTemplate: input.promptTemplate,
      workspace: input.workspace,
      config,
      codexRuntimeConfigToml: configToml,
      codexRuntimeAuthJsonBase64: authJsonBase64,
      codexRequiredEnvNames: requiredEnvNames,
    };
  }

  private async sendDispatchRequest(dispatchRequest: DispatchRequest, signal: AbortSignal): Promise<Response> {
    return fetch(this.deps.dispatchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.deps.secret}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(dispatchRequest),
      signal,
    });
  }

  private async abortRun(
    runId: string,
    logger: { debug: (meta: Record<string, unknown>, msg: string) => void },
  ): Promise<void> {
    const response = await fetch(this.buildAbortUrl(runId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.deps.secret}`,
        Accept: "application/json",
      },
    });

    if (response.status === 404) {
      logger.debug({ runId }, "Dispatch abort skipped because run was not active");
      return;
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Dispatch abort failed: ${response.status} ${errorText}`);
    }
  }

  private buildAbortUrl(runId: string): string {
    const url = new URL(this.deps.dispatchUrl);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${encodeURIComponent(runId)}/abort`;
    return url.toString();
  }
}

function parseSseLine(
  line: string,
  onEvent: AgentRunnerEventHandler,
  logger: {
    debug: (meta: Record<string, unknown>, msg: string) => void;
    warn: (meta: Record<string, unknown>, msg: string) => void;
  },
): RunOutcome | null {
  if (!line.trim()) return null;

  const trimmed = line.trimStart();
  if (!trimmed.startsWith("data:")) {
    logger.warn({ line }, "Malformed SSE line, skipping");
    return null;
  }
  const payload = trimmed.slice(5).trimStart();

  try {
    const message: DispatchStreamMessage = JSON.parse(payload);
    if (message.type === "event") {
      onEvent(message.payload);
    } else if (message.type === "outcome") {
      logger.debug({ outcome: message.payload }, "Received outcome from data plane");
      return message.payload;
    }
  } catch (parseError) {
    logger.warn({ line, error: String(parseError) }, "Failed to parse SSE message");
  }
  return null;
}

async function parseDispatchStream(
  body: ReadableStream<Uint8Array>,
  onEvent: AgentRunnerEventHandler,
  logger: {
    debug: (meta: Record<string, unknown>, msg: string) => void;
    warn: (meta: Record<string, unknown>, msg: string) => void;
  },
): Promise<RunOutcome> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: RunOutcome | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const parsed = parseSseLine(line, onEvent, logger);
        if (parsed) outcome = parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!outcome) {
    throw new Error("Dispatch stream ended without outcome");
  }

  return outcome;
}
