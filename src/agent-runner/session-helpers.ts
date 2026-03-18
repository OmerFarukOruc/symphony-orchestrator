import type { ChildProcessWithoutNullStreams } from "node:child_process";

export function waitForStartup(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (timeoutMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onData = () => settle(resolve);
    const onExit = (code: number | null) =>
      settle(() => reject(new Error(`child exited with code ${code} before startup readiness`)));
    const onAbort = () => settle(() => reject(new Error("startup readiness interrupted")));
    const timer = setTimeout(
      () => settle(() => reject(new Error(`startup readiness timed out after ${timeoutMs}ms`))),
      timeoutMs,
    );

    const cleanup = () => {
      child.stdout.removeListener("data", onData);
      child.stderr.removeListener("data", onData);
      child.removeListener("exit", onExit);
      signal.removeEventListener("abort", onAbort);
      clearTimeout(timer);
    };

    child.stdout.once("data", onData);
    child.stderr.once("data", onData);
    child.once("exit", onExit);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function buildDynamicTools(): object[] {
  return [
    {
      name: "linear_graphql",
      description: "Run exactly one GraphQL operation against Linear.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", description: "A single GraphQL query, mutation, or subscription document." },
          variables: {
            type: "object",
            additionalProperties: true,
            description: "Optional GraphQL variables for the document.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "github_api",
      description: "Read pull request status or add a pull request comment in GitHub.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["add_pr_comment", "get_pr_status"] },
          owner: { type: "string" },
          repo: { type: "string" },
          pullNumber: { type: "number" },
          body: { type: "string" },
        },
        required: ["action", "owner", "repo", "pullNumber"],
      },
    },
  ];
}
