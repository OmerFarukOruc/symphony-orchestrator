import { getRequiredProviderEnvNames, prepareCodexRuntimeConfig } from "../codex/runtime-config.js";
import type { ServiceConfig, SymphonyLogger, Issue, ModelSelection, Workspace, RunOutcome } from "../core/types.js";
import type { AgentRunnerEventHandler } from "../agent-runner/contracts.js";
import type { DispatchRequest, DispatchStreamMessage, RunAttemptDispatcher } from "./types.js";

interface DispatchClientDeps {
  dispatchUrl: string;
  secret: string;
  getConfig: () => ServiceConfig;
  logger: SymphonyLogger;
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

    // Pre-compute Codex runtime config (TOML + auth.json)
    const { configToml, authJsonBase64 } = await prepareCodexRuntimeConfig(config.codex);
    const requiredEnvNames = getRequiredProviderEnvNames(config.codex);

    // Build the dispatch request payload
    const dispatchRequest: DispatchRequest = {
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

    logger.debug({ runId: input.issue.id }, "Dispatching runAttempt to data plane");

    // POST to data plane and handle SSE stream
    const response = await fetch(this.deps.dispatchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.deps.secret}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(dispatchRequest),
      signal: input.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, "Dispatch request failed");
      throw new Error(`Dispatch request failed: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error("Dispatch response has no body");
    }

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let outcome: RunOutcome | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (separated by double newline)
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? ""; // Keep incomplete message in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          // Parse SSE data line
          const dataMatch = line.match(/^data:\s*(.+)$/s);
          if (!dataMatch) {
            logger.warn({ line }, "Malformed SSE line, skipping");
            continue;
          }

          try {
            const message: DispatchStreamMessage = JSON.parse(dataMatch[1]);

            if (message.type === "event") {
              // Forward event to the onEvent callback
              input.onEvent(message.payload);
            } else if (message.type === "outcome") {
              outcome = message.payload;
              logger.debug({ outcome }, "Received outcome from data plane");
            }
          } catch (parseError) {
            logger.warn({ line, error: String(parseError) }, "Failed to parse SSE message");
          }
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
}
