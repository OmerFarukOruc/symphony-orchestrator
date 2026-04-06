/**
 * RPC method name constants for the Codex app-server protocol.
 * Use these instead of bare string literals to prevent typos and
 * make cross-file references easy to find.
 */
export const CODEX_METHOD = {
  Initialize: "initialize",
  Initialized: "initialized",
  AccountRead: "account/read",
  AccountRateLimitsRead: "account/rateLimits/read",
  ConfigRequirementsRead: "configRequirements/read",
  ConfigRead: "config/read",
  ThreadResume: "thread/resume",
  ThreadRollback: "thread/rollback",
  ThreadStart: "thread/start",
  ThreadRead: "thread/read",
  ThreadCompactStart: "thread/compact/start",
  TurnStart: "turn/start",
  TurnSteer: "turn/steer",
  ReviewStart: "review/start",
  CommandExec: "command/exec",
  ModelList: "model/list",
} as const;
