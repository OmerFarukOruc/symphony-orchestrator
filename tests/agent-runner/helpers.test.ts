import { describe, expect, it } from "vitest";

import {
  asRecord,
  asString,
  authIsRequired,
  extractAgentOrUserMessage,
  extractItemContent,
  extractRateLimits,
  extractThreadId,
  extractTokenUsageSnapshot,
  extractTurnId,
  getTurnSandboxPolicy,
  hasUsableAccount,
} from "../../src/agent-runner/helpers.js";
import type { ServiceConfig } from "../../src/core/types.js";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

describe("re-exported type-guards", () => {
  it("asRecord returns the object for records", () => {
    const obj = { a: 1 };
    expect(asRecord(obj)).toBe(obj);
  });

  it("asRecord returns empty object for non-records", () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord(undefined)).toEqual({});
  });

  it("asString returns the string for strings", () => {
    expect(asString("hello")).toBe("hello");
  });

  it("asString returns null for non-strings", () => {
    expect(asString(42)).toBeNull();
    expect(asString(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractThreadId
// ---------------------------------------------------------------------------

describe("extractThreadId", () => {
  it("returns threadId from top-level property", () => {
    expect(extractThreadId({ threadId: "t-123" })).toBe("t-123");
  });

  it("returns thread.id when threadId is absent", () => {
    expect(extractThreadId({ thread: { id: "t-456" } })).toBe("t-456");
  });

  it("prefers threadId over thread.id", () => {
    expect(extractThreadId({ threadId: "direct", thread: { id: "nested" } })).toBe("direct");
  });

  it("returns null for missing fields", () => {
    expect(extractThreadId({})).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractThreadId(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(extractThreadId(undefined)).toBeNull();
  });

  it("returns null when threadId is a number", () => {
    expect(extractThreadId({ threadId: 42 })).toBeNull();
  });

  it("returns null when thread is a string (not an object)", () => {
    expect(extractThreadId({ thread: "not-an-object" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractTurnId
// ---------------------------------------------------------------------------

describe("extractTurnId", () => {
  it("returns turnId from top-level property", () => {
    expect(extractTurnId({ turnId: "turn-1" })).toBe("turn-1");
  });

  it("returns turn.id when turnId is absent", () => {
    expect(extractTurnId({ turn: { id: "turn-2" } })).toBe("turn-2");
  });

  it("prefers turnId over turn.id", () => {
    expect(extractTurnId({ turnId: "direct", turn: { id: "nested" } })).toBe("direct");
  });

  it("returns null for missing fields", () => {
    expect(extractTurnId({})).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractTurnId(null)).toBeNull();
  });

  it("returns null when turnId is a boolean", () => {
    expect(extractTurnId({ turnId: true })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractTokenUsageSnapshot
// ---------------------------------------------------------------------------

describe("extractTokenUsageSnapshot", () => {
  it("returns a valid snapshot when all three fields are numbers", () => {
    const result = extractTokenUsageSnapshot({
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
    });
    expect(result).toEqual({ inputTokens: 100, outputTokens: 200, totalTokens: 300 });
  });

  it("returns null when inputTokens is missing", () => {
    expect(extractTokenUsageSnapshot({ outputTokens: 200, totalTokens: 300 })).toBeNull();
  });

  it("returns null when outputTokens is missing", () => {
    expect(extractTokenUsageSnapshot({ inputTokens: 100, totalTokens: 300 })).toBeNull();
  });

  it("returns null when totalTokens is missing", () => {
    expect(extractTokenUsageSnapshot({ inputTokens: 100, outputTokens: 200 })).toBeNull();
  });

  it("returns null when a field is a string instead of a number", () => {
    expect(extractTokenUsageSnapshot({ inputTokens: "100", outputTokens: 200, totalTokens: 300 })).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractTokenUsageSnapshot(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(extractTokenUsageSnapshot(undefined)).toBeNull();
  });

  it("returns null for an empty object", () => {
    expect(extractTokenUsageSnapshot({})).toBeNull();
  });

  it("returns snapshot with zero values", () => {
    const result = extractTokenUsageSnapshot({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    expect(result).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });
});

// ---------------------------------------------------------------------------
// getTurnSandboxPolicy
// ---------------------------------------------------------------------------

function makeConfig(policyOverrides: Record<string, unknown> = {}): ServiceConfig {
  return {
    codex: {
      turnSandboxPolicy: {
        type: "workspaceWrite",
        ...policyOverrides,
      },
    },
  } as unknown as ServiceConfig;
}

describe("getTurnSandboxPolicy", () => {
  it("adds workspacePath to writableRoots for workspaceWrite policy", () => {
    const config = makeConfig();
    const result = getTurnSandboxPolicy(config, "/ws/project");
    expect(result.type).toBe("workspaceWrite");
    expect(result.writableRoots).toContain("/ws/project");
    expect(result.readOnlyAccess).toEqual({ type: "fullAccess" });
    expect(result.networkAccess).toBe(false);
  });

  it("does not duplicate workspacePath if already in writableRoots", () => {
    const config = makeConfig({ writableRoots: ["/ws/project"] });
    const result = getTurnSandboxPolicy(config, "/ws/project");
    const roots = result.writableRoots as string[];
    expect(roots.filter((r: string) => r === "/ws/project")).toHaveLength(1);
  });

  it("preserves existing writableRoots and appends new path", () => {
    const config = makeConfig({ writableRoots: ["/existing"] });
    const result = getTurnSandboxPolicy(config, "/ws/project");
    expect(result.writableRoots).toEqual(["/existing", "/ws/project"]);
  });

  it("handles non-array writableRoots gracefully", () => {
    const config = makeConfig({ writableRoots: "not-an-array" });
    const result = getTurnSandboxPolicy(config, "/ws/project");
    expect(result.writableRoots).toEqual(["/ws/project"]);
  });

  it("returns policy as-is for non-workspaceWrite types", () => {
    const config = {
      codex: {
        turnSandboxPolicy: { type: "none", customProp: "value" },
      },
    } as unknown as ServiceConfig;
    const result = getTurnSandboxPolicy(config, "/ws/project");
    expect(result).toEqual({ type: "none", customProp: "value" });
    expect(result).not.toHaveProperty("readOnlyAccess");
    expect(result).not.toHaveProperty("networkAccess");
  });

  it("spreads additional policy properties for workspaceWrite", () => {
    const config = makeConfig({ extraSetting: true });
    const result = getTurnSandboxPolicy(config, "/ws/project");
    expect(result.extraSetting).toBe(true);
  });

  it("does not mutate the original config policy", () => {
    const originalRoots = ["/original"];
    const config = makeConfig({ writableRoots: originalRoots });
    getTurnSandboxPolicy(config, "/ws/new");
    expect(originalRoots).toEqual(["/original"]);
  });
});

// ---------------------------------------------------------------------------
// extractRateLimits
// ---------------------------------------------------------------------------

describe("extractRateLimits", () => {
  it("returns rateLimits from the result", () => {
    const limits = { remaining: 100 };
    expect(extractRateLimits({ rateLimits: limits })).toBe(limits);
  });

  it("falls back to limits property", () => {
    const limits = { remaining: 50 };
    expect(extractRateLimits({ limits })).toBe(limits);
  });

  it("prefers rateLimits over limits", () => {
    expect(extractRateLimits({ rateLimits: "primary", limits: "fallback" })).toBe("primary");
  });

  it("returns null when neither field exists", () => {
    expect(extractRateLimits({})).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractRateLimits(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(extractRateLimits(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// authIsRequired
// ---------------------------------------------------------------------------

describe("authIsRequired", () => {
  it("returns true for authRequired === true", () => {
    expect(authIsRequired({ authRequired: true })).toBe(true);
  });

  it("returns true for requiresOpenaiAuth === true", () => {
    expect(authIsRequired({ requiresOpenaiAuth: true })).toBe(true);
  });

  it("returns true for requiresLogin === true", () => {
    expect(authIsRequired({ requiresLogin: true })).toBe(true);
  });

  it("returns true for auth.required === true", () => {
    expect(authIsRequired({ auth: { required: true } })).toBe(true);
  });

  it("returns true for openai.required === true", () => {
    expect(authIsRequired({ openai: { required: true } })).toBe(true);
  });

  it("returns true for status === 'unauthenticated'", () => {
    expect(authIsRequired({ status: "unauthenticated" })).toBe(true);
  });

  it("returns false when no auth indicators are present", () => {
    expect(authIsRequired({})).toBe(false);
  });

  it("returns false for null input", () => {
    expect(authIsRequired(null)).toBe(false);
  });

  it("returns false when auth fields are false", () => {
    expect(authIsRequired({ authRequired: false, requiresOpenaiAuth: false })).toBe(false);
  });

  it("returns false for status other than unauthenticated", () => {
    expect(authIsRequired({ status: "authenticated" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasUsableAccount
// ---------------------------------------------------------------------------

describe("hasUsableAccount", () => {
  it("returns true when account is a non-null object", () => {
    expect(hasUsableAccount({ account: { id: "acc-1" } })).toBe(true);
  });

  it("returns true when accountId is a string", () => {
    expect(hasUsableAccount({ accountId: "acc-1" })).toBe(true);
  });

  it("returns true when auth.accountId is a string", () => {
    expect(hasUsableAccount({ auth: { accountId: "acc-1" } })).toBe(true);
  });

  it("returns true when status is 'authenticated'", () => {
    expect(hasUsableAccount({ status: "authenticated" })).toBe(true);
  });

  it("returns false when account is null", () => {
    expect(hasUsableAccount({ account: null })).toBe(false);
  });

  it("returns false when no account indicators present", () => {
    expect(hasUsableAccount({})).toBe(false);
  });

  it("returns false for null input", () => {
    expect(hasUsableAccount(null)).toBe(false);
  });

  it("returns false when accountId is a number", () => {
    expect(hasUsableAccount({ accountId: 123 })).toBe(false);
  });

  it("returns false for status other than authenticated", () => {
    expect(hasUsableAccount({ status: "pending" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractAgentOrUserMessage
// ---------------------------------------------------------------------------

describe("extractAgentOrUserMessage", () => {
  it("returns text property when present", () => {
    expect(extractAgentOrUserMessage({ text: "hello" })).toBe("hello");
  });

  it("joins text from content array", () => {
    const item = {
      content: [{ text: "first " }, { text: "second" }],
    };
    expect(extractAgentOrUserMessage(item)).toBe("first second");
  });

  it("filters non-text entries from content array", () => {
    const item = {
      content: [{ text: "a" }, { image: "data" }, { text: "b" }],
    };
    expect(extractAgentOrUserMessage(item)).toBe("ab");
  });

  it("returns null when no text and no content array", () => {
    expect(extractAgentOrUserMessage({})).toBeNull();
  });

  it("returns null when content is not an array", () => {
    expect(extractAgentOrUserMessage({ content: "string" })).toBeNull();
  });

  it("returns empty string when content array has no text entries", () => {
    expect(extractAgentOrUserMessage({ content: [{ image: "data" }] })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// extractItemContent
// ---------------------------------------------------------------------------

describe("extractItemContent", () => {
  const emptyBuffers = new Map<string, string>();

  describe("agentMessage (completed)", () => {
    it("extracts text from agent message", () => {
      const result = extractItemContent("agentMessage", null, { text: "done" }, "completed", emptyBuffers);
      expect(result).toBe("done");
    });

    it("returns null for started verb (not handled for agentMessage)", () => {
      const result = extractItemContent("agentMessage", null, { text: "hi" }, "started", emptyBuffers);
      expect(result).toBeNull();
    });
  });

  describe("userMessage (started)", () => {
    it("extracts text from user message", () => {
      const result = extractItemContent("userMessage", null, { text: "help me" }, "started", emptyBuffers);
      expect(result).toBe("help me");
    });

    it("returns null for completed verb (not handled for userMessage)", () => {
      const result = extractItemContent("userMessage", null, { text: "help" }, "completed", emptyBuffers);
      expect(result).toBeNull();
    });
  });

  describe("plan (completed)", () => {
    it("extracts text from plan item", () => {
      const result = extractItemContent("plan", null, { text: "step 1" }, "completed", emptyBuffers);
      expect(result).toBe("step 1");
    });
  });

  describe("reasoning (completed)", () => {
    it("returns buffered reasoning when available", () => {
      const buffers = new Map([["id-1", "buffered reasoning text"]]);
      const result = extractItemContent("reasoning", "id-1", { summary: "summary" }, "completed", buffers);
      expect(result).toBe("buffered reasoning text");
    });

    it("falls back to summary when no buffer", () => {
      const result = extractItemContent("reasoning", "id-1", { summary: "summary text" }, "completed", emptyBuffers);
      expect(result).toBe("summary text");
    });

    it("falls back to text when no summary and no buffer", () => {
      const result = extractItemContent("reasoning", "id-1", { text: "raw text" }, "completed", emptyBuffers);
      expect(result).toBe("raw text");
    });

    it("returns null for started verb", () => {
      const result = extractItemContent("reasoning", "id-1", { summary: "s" }, "started", emptyBuffers);
      expect(result).toBeNull();
    });

    it("uses summary when id is null", () => {
      const result = extractItemContent("reasoning", null, { summary: "no id" }, "completed", emptyBuffers);
      expect(result).toBe("no id");
    });
  });

  describe("commandExecution", () => {
    it("returns command string for started verb", () => {
      const result = extractItemContent("commandExecution", null, { command: "ls -la" }, "started", emptyBuffers);
      expect(result).toBe("ls -la");
    });

    it("returns output string for completed verb", () => {
      const result = extractItemContent(
        "commandExecution",
        null,
        { output: "file1.txt\nfile2.txt" },
        "completed",
        emptyBuffers,
      );
      expect(result).toBe("file1.txt\nfile2.txt");
    });

    it("returns exit code string when output is absent", () => {
      const result = extractItemContent("commandExecution", null, { exitCode: 1 }, "completed", emptyBuffers);
      expect(result).toBe("Exit code: 1");
    });

    it("returns exit code 0", () => {
      const result = extractItemContent("commandExecution", null, { exitCode: 0 }, "completed", emptyBuffers);
      expect(result).toBe("Exit code: 0");
    });

    it("returns null when neither output nor exitCode present", () => {
      const result = extractItemContent("commandExecution", null, {}, "completed", emptyBuffers);
      expect(result).toBeNull();
    });

    it("handles non-numeric exitCode via JSON.stringify", () => {
      const result = extractItemContent("commandExecution", null, { exitCode: "weird" }, "completed", emptyBuffers);
      expect(result).toContain("weird");
    });
  });

  describe("fileChange", () => {
    it("returns file path for started verb", () => {
      const result = extractItemContent("fileChange", null, { path: "/src/index.ts" }, "started", emptyBuffers);
      expect(result).toBe("/src/index.ts");
    });

    it("returns diff for completed verb", () => {
      const result = extractItemContent("fileChange", null, { diff: "+added line" }, "completed", emptyBuffers);
      expect(result).toBe("+added line");
    });

    it("falls back to content when diff is absent", () => {
      const result = extractItemContent("fileChange", null, { content: "file content" }, "completed", emptyBuffers);
      expect(result).toBe("file content");
    });

    it("falls back to path when both diff and content are absent", () => {
      const result = extractItemContent("fileChange", null, { path: "/src/fallback.ts" }, "completed", emptyBuffers);
      expect(result).toBe("/src/fallback.ts");
    });
  });

  describe("dynamicToolCall", () => {
    it("returns name(args) for started verb with string arguments", () => {
      const result = extractItemContent(
        "dynamicToolCall",
        null,
        { name: "readFile", arguments: '{"path": "/foo"}' },
        "started",
        emptyBuffers,
      );
      expect(result).toContain("readFile");
      expect(result).toContain("path");
    });

    it("returns name(JSON) for started verb with object arguments", () => {
      const result = extractItemContent(
        "dynamicToolCall",
        null,
        { name: "myTool", arguments: { key: "val" } },
        "started",
        emptyBuffers,
      );
      expect(result).toContain("myTool");
      expect(result).toContain("key");
    });

    it("uses fallback 'tool' when name is absent", () => {
      const result = extractItemContent("dynamicToolCall", null, { arguments: "{}" }, "started", emptyBuffers);
      expect(result).toMatch(/^tool\(/);
    });

    it("returns output for completed verb", () => {
      const result = extractItemContent("dynamicToolCall", null, { output: "result data" }, "completed", emptyBuffers);
      expect(result).toBe("result data");
    });

    it("falls back to result for completed verb", () => {
      const result = extractItemContent(
        "dynamicToolCall",
        null,
        { result: "fallback result" },
        "completed",
        emptyBuffers,
      );
      expect(result).toBe("fallback result");
    });

    it("JSON-stringifies non-string result for completed verb", () => {
      const result = extractItemContent("dynamicToolCall", null, { result: { count: 42 } }, "completed", emptyBuffers);
      expect(result).toContain("count");
      expect(result).toContain("42");
    });
  });

  describe("webSearch", () => {
    it("returns query for started verb", () => {
      const result = extractItemContent("webSearch", null, { query: "vitest docs" }, "started", emptyBuffers);
      expect(result).toBe("vitest docs");
    });

    it("returns result count for completed verb", () => {
      const result = extractItemContent(
        "webSearch",
        null,
        { results: [{ url: "a" }, { url: "b" }] },
        "completed",
        emptyBuffers,
      );
      expect(result).toBe("Found 2 results");
    });

    it("handles missing results array for completed verb", () => {
      const result = extractItemContent("webSearch", null, {}, "completed", emptyBuffers);
      expect(result).toBe("Found 0 results");
    });
  });

  describe("unknown type", () => {
    it("returns null for an unrecognized type", () => {
      const result = extractItemContent("unknown", null, { text: "data" }, "completed", emptyBuffers);
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Mutation-killing tests: extractItemContent isDiff propagation
  // -------------------------------------------------------------------------

  describe("isDiff flag propagation", () => {
    it("fileChange started returns isDiff=false (path is not a diff)", () => {
      // Kills: BooleanLiteral helpers.ts:122 isDiff: false -> true
      // Kills: BooleanLiteral helpers.ts:158 let isDiff = false -> true
      // The sanitizeContent call receives isDiff, but we verify the behavior
      // by checking that started fileChange content is the path itself
      const result = extractItemContent("fileChange", null, { path: "/src/index.ts" }, "started", emptyBuffers);
      // If isDiff were true, sanitizeContent would treat it as diff content
      expect(result).toBe("/src/index.ts");
    });

    it("fileChange completed returns diff content (isDiff=true)", () => {
      const result = extractItemContent("fileChange", null, { diff: "+new line" }, "completed", emptyBuffers);
      expect(result).toBe("+new line");
    });
  });

  // -------------------------------------------------------------------------
  // Mutation-killing tests: extractFileChangeContent verb branching
  // -------------------------------------------------------------------------

  describe("fileChange verb branching", () => {
    it("started verb returns path, not diff", () => {
      // Kills: ConditionalExpression helpers.ts:121 if (verb === "started") -> if (false)
      // Kills: BlockStatement helpers.ts:121 block removal
      const startedResult = extractItemContent(
        "fileChange",
        null,
        { path: "/src/a.ts", diff: "+change", content: "full" },
        "started",
        emptyBuffers,
      );
      expect(startedResult).toBe("/src/a.ts");

      const completedResult = extractItemContent(
        "fileChange",
        null,
        { path: "/src/a.ts", diff: "+change", content: "full" },
        "completed",
        emptyBuffers,
      );
      expect(completedResult).toBe("+change");
      // Verify they are different — started returns path, completed returns diff
      expect(startedResult).not.toBe(completedResult);
    });
  });

  // -------------------------------------------------------------------------
  // Mutation-killing tests: extractCommandContent exitCode type handling
  // -------------------------------------------------------------------------

  describe("extractCommandContent exitCode type branching", () => {
    it("numeric exitCode uses String() representation", () => {
      // Kills: ConditionalExpression helpers.ts:113 typeof rawCode === "number" -> true/false
      // Kills: EqualityOperator helpers.ts:113 === -> !==
      const result = extractItemContent("commandExecution", null, { exitCode: 42 }, "completed", emptyBuffers);
      expect(result).toBe("Exit code: 42");
    });

    it("non-numeric exitCode uses JSON.stringify representation", () => {
      const result = extractItemContent(
        "commandExecution",
        null,
        { exitCode: { special: true } },
        "completed",
        emptyBuffers,
      );
      // JSON.stringify produces quoted/structured output; String() would give [object Object]
      expect(result).toContain("special");
      expect(result).not.toContain("[object Object]");
    });

    it("string exitCode is JSON-stringified (not passed through String())", () => {
      const result = extractItemContent("commandExecution", null, { exitCode: "SIGKILL" }, "completed", emptyBuffers);
      // JSON.stringify wraps strings in quotes: "\"SIGKILL\""
      expect(result).toBe('Exit code: "SIGKILL"');
    });
  });

  // -------------------------------------------------------------------------
  // Mutation-killing tests: extractAgentOrUserMessage .map mutation
  // -------------------------------------------------------------------------

  describe("extractAgentOrUserMessage content mapping", () => {
    it("maps content items through asRecord().text extraction", () => {
      // Kills: MethodExpression helpers.ts:89 .map -> removal
      const item = { content: [{ text: "hello " }, { text: "world" }] };
      const result = extractAgentOrUserMessage(item);
      expect(result).toBe("hello world");
    });
  });

  // -------------------------------------------------------------------------
  // Mutation-killing tests: dynamicToolCall args fallback
  // -------------------------------------------------------------------------

  describe("dynamicToolCall args fallback", () => {
    it("uses '{}' as fallback when sanitizeContent returns null for args", () => {
      // Kills: StringLiteral helpers.ts:137 args ?? "{}" -> args ?? ""
      // When arguments is a string that sanitizeContent nullifies, the fallback should be "{}"
      const result = extractItemContent(
        "dynamicToolCall",
        null,
        { name: "myTool", arguments: undefined },
        "started",
        emptyBuffers,
      );
      // With no arguments, it should show the fallback
      expect(result).toContain("myTool");
      expect(result).toContain("{}");
    });
  });

  // -------------------------------------------------------------------------
  // Mutation-killing tests: plan verb === "completed" check
  // -------------------------------------------------------------------------

  describe("plan verb filtering", () => {
    it("plan extracts content only for completed verb, not started", () => {
      // Kills: ConditionalExpression helpers.ts:163 (type === "plan" && verb === "completed") -> (type === "plan" && true)
      const completedResult = extractItemContent("plan", null, { text: "the plan" }, "completed", emptyBuffers);
      expect(completedResult).toBe("the plan");

      const startedResult = extractItemContent("plan", null, { text: "the plan" }, "started", emptyBuffers);
      expect(startedResult).toBeNull();
    });
  });
});
