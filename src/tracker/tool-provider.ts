/**
 * TrackerToolProvider — provides tracker-specific dynamic tools to Codex sessions.
 *
 * Each tracker implementation (Linear, GitHub, or none) returns an instance
 * that knows which dynamic tools it supports and can handle tool calls.
 *
 * This decouples the agent-runner and dispatch layers from the concrete
 * LinearClient, replacing the `linearClient: LinearClient | null` propagation
 * chain with a clean port interface.
 */

export interface TrackerToolCall {
  response?: unknown;
  fatalFailure: { code: string; message: string } | null;
}

export interface TrackerToolProvider {
  /**
   * The names of tracker-specific dynamic tools this provider exposes
   * (e.g. `["linear_graphql"]`). Used to build the `dynamicTools` list
   * passed to Codex `thread/start`.
   */
  readonly toolNames: ReadonlyArray<string>;

  /**
   * Handle a tool call by name. Returns `null` when the tool name is not
   * managed by this provider (the caller falls through to the next handler).
   */
  handleToolCall(toolName: string, toolArgs: unknown): Promise<TrackerToolCall | null>;
}

/**
 * A no-op provider for trackers that expose no Codex tools (e.g. GitHub).
 */
export class NullTrackerToolProvider implements TrackerToolProvider {
  readonly toolNames: ReadonlyArray<string> = [];

  async handleToolCall(_toolName: string, _toolArgs: unknown): Promise<TrackerToolCall | null> {
    return null;
  }
}
