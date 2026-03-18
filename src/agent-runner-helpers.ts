import { asRecord, asStringOrNull as asString } from "./utils/type-guards.js";
import { sanitizeContent } from "./content-sanitizer.js";
import type { ServiceConfig, TokenUsageSnapshot } from "./types.js";

function extractThreadId(result: unknown): string | null {
  const record = asRecord(result);
  return asString(record.threadId) ?? asString(asRecord(record.thread).id) ?? null;
}

function extractTurnId(result: unknown): string | null {
  const record = asRecord(result);
  return asString(record.turnId) ?? asString(asRecord(record.turn).id) ?? null;
}

function extractTokenUsageSnapshot(value: unknown): TokenUsageSnapshot | null {
  const usage = asRecord(value);
  const inputTokens = typeof usage.inputTokens === "number" ? usage.inputTokens : null;
  const outputTokens = typeof usage.outputTokens === "number" ? usage.outputTokens : null;
  const totalTokens = typeof usage.totalTokens === "number" ? usage.totalTokens : null;
  if (inputTokens === null || outputTokens === null || totalTokens === null) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function getTurnSandboxPolicy(config: ServiceConfig, workspacePath: string): Record<string, unknown> {
  const policy = { ...config.codex.turnSandboxPolicy };
  if (policy.type === "workspaceWrite") {
    const writableRoots = Array.isArray(policy.writableRoots) ? [...policy.writableRoots] : [];
    if (!writableRoots.includes(workspacePath)) {
      writableRoots.push(workspacePath);
    }

    return {
      readOnlyAccess: {
        type: "fullAccess",
      },
      networkAccess: false,
      ...policy,
      writableRoots,
    };
  }

  return policy;
}

function extractRateLimits(result: unknown): unknown | null {
  const record = asRecord(result);
  return record.rateLimits ?? record.limits ?? null;
}

function authIsRequired(result: unknown): boolean {
  const record = asRecord(result);
  const auth = asRecord(record.auth);
  const openai = asRecord(record.openai);
  return (
    record.authRequired === true ||
    record.requiresOpenaiAuth === true ||
    record.requiresLogin === true ||
    auth.required === true ||
    openai.required === true ||
    record.status === "unauthenticated"
  );
}

function hasUsableAccount(result: unknown): boolean {
  const record = asRecord(result);
  return (
    (typeof record.account === "object" && record.account !== null) ||
    typeof record.accountId === "string" ||
    typeof asRecord(record.auth).accountId === "string" ||
    record.status === "authenticated"
  );
}

function extractItemContent(
  type: string,
  id: string | null,
  item: Record<string, unknown>,
  verb: "started" | "completed",
  reasoningBuffers: Map<string, string>,
): string | null {
  let content: string | null = null;
  let isDiff = false;

  if (type === "agentMessage" && verb === "completed") {
    content = asString(item.text) ?? null;
    if (!content && Array.isArray(item.content)) {
      content = item.content
        .map((c) => asString(asRecord(c).text))
        .filter(Boolean)
        .join("");
    }
  } else if (type === "reasoning" && verb === "completed") {
    if (id && reasoningBuffers.has(id)) {
      content = reasoningBuffers.get(id) ?? null;
    } else {
      content = asString(item.summary) ?? asString(item.text) ?? null;
    }
  } else if (type === "commandExecution") {
    if (verb === "started") {
      content = asString(item.command);
    } else {
      content = asString(item.output) ?? (item.exitCode !== undefined ? `Exit code: ${item.exitCode}` : null);
    }
  } else if (type === "fileChange") {
    if (verb === "started") {
      content = asString(item.path);
    } else {
      content = asString(item.diff) ?? asString(item.content) ?? asString(item.path);
      isDiff = true;
    }
  } else if (type === "dynamicToolCall") {
    if (verb === "started") {
      const name = asString(item.name) ?? "tool";
      const args = typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {});
      content = `${name}(${args})`;
    } else {
      content =
        asString(item.output) ?? (typeof item.result === "string" ? item.result : JSON.stringify(item.result ?? {}));
    }
  } else if (type === "webSearch") {
    if (verb === "started") {
      content = asString(item.query);
    } else {
      const results = Array.isArray(item.results) ? item.results : [];
      content = `Found ${results.length} results`;
    }
  } else if (type === "userMessage" && verb === "started") {
    content = asString(item.text) ?? null;
    if (!content && Array.isArray(item.content)) {
      content = item.content
        .map((c) => asString(asRecord(c).text))
        .filter(Boolean)
        .join("");
    }
  }

  return sanitizeContent(content, { isDiff });
}

export {
  asRecord,
  asString,
  authIsRequired,
  extractItemContent,
  extractRateLimits,
  extractThreadId,
  extractTokenUsageSnapshot,
  extractTurnId,
  getTurnSandboxPolicy,
  hasUsableAccount,
};
