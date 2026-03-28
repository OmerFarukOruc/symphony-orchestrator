import { asRecord, asStringOrNull as asString } from "../utils/type-guards.js";
import { redactSensitiveValue, sanitizeContent } from "../core/content-sanitizer.js";
import type { ServiceConfig, TokenUsageSnapshot } from "../core/types.js";

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

function extractRateLimits(result: unknown): unknown {
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

function extractAgentOrUserMessage(item: Record<string, unknown>): string | null {
  const text = asString(item.text) ?? null;
  if (text) {
    return text;
  }
  if (!Array.isArray(item.content)) {
    return null;
  }
  return item.content
    .map((c) => asString(asRecord(c).text))
    .filter(Boolean)
    .join("");
}

function extractReasoningContent(
  id: string | null,
  item: Record<string, unknown>,
  reasoningBuffers: Map<string, string>,
): string | null {
  if (id && reasoningBuffers.has(id)) {
    return reasoningBuffers.get(id) ?? null;
  }
  return asString(item.summary) ?? asString(item.text) ?? null;
}

function extractCommandContent(item: Record<string, unknown>, verb: "started" | "completed"): string | null {
  if (verb === "started") {
    return asString(item.command);
  }
  if (asString(item.output) !== null) return asString(item.output);
  if (item.exitCode === undefined) return null;
  const rawCode: unknown = item.exitCode;
  const code = typeof rawCode === "number" ? String(rawCode) : JSON.stringify(rawCode);
  return `Exit code: ${code}`;
}

function extractFileChangeContent(
  item: Record<string, unknown>,
  verb: "started" | "completed",
): { content: string | null; isDiff: boolean } {
  if (verb === "started") {
    return { content: asString(item.path), isDiff: false };
  }
  return {
    content: asString(item.diff) ?? asString(item.content) ?? asString(item.path),
    isDiff: true,
  };
}

function extractDynamicToolCallContent(item: Record<string, unknown>, verb: "started" | "completed"): string | null {
  if (verb === "started") {
    const name = asString(item.name) ?? "tool";
    const args =
      typeof item.arguments === "string"
        ? sanitizeContent(item.arguments)
        : JSON.stringify(redactSensitiveValue(item.arguments ?? {}));
    return `${name}(${args ?? "{}"})`;
  }
  return asString(item.output) ?? (typeof item.result === "string" ? item.result : JSON.stringify(item.result ?? {}));
}

function extractWebSearchContent(item: Record<string, unknown>, verb: "started" | "completed"): string | null {
  if (verb === "started") {
    return asString(item.query);
  }
  const results = Array.isArray(item.results) ? item.results : [];
  return `Found ${results.length} results`;
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

  if (
    (type === "agentMessage" && verb === "completed") ||
    (type === "userMessage" && verb === "started") ||
    (type === "plan" && verb === "completed")
  ) {
    content = extractAgentOrUserMessage(item);
  } else if (type === "reasoning" && verb === "completed") {
    content = extractReasoningContent(id, item, reasoningBuffers);
  } else if (type === "commandExecution") {
    content = extractCommandContent(item, verb);
  } else if (type === "fileChange") {
    const result = extractFileChangeContent(item, verb);
    content = result.content;
    isDiff = result.isDiff;
  } else if (type === "dynamicToolCall") {
    content = extractDynamicToolCallContent(item, verb);
  } else if (type === "webSearch") {
    content = extractWebSearchContent(item, verb);
  }

  return sanitizeContent(content, { isDiff });
}

export { asRecord, asStringOrNull as asString } from "../utils/type-guards.js";
export {
  authIsRequired,
  extractAgentOrUserMessage,
  extractItemContent,
  extractRateLimits,
  extractThreadId,
  extractTokenUsageSnapshot,
  extractTurnId,
  getTurnSandboxPolicy,
  hasUsableAccount,
};
