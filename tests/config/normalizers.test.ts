import { describe, expect, it } from "vitest";

import {
  asCodexAuthMode,
  normalizeCodexProvider,
  normalizeNotifications,
  normalizeGitHub,
  normalizeRepos,
  normalizeStateMachine,
  normalizeApprovalPolicy,
  asReasoningEffort,
  normalizeTurnSandboxPolicy,
} from "../../src/config/normalizers.js";

describe("asCodexAuthMode", () => {
  it("returns openai_login for 'openai_login'", () => {
    expect(asCodexAuthMode("openai_login", "api_key")).toBe("openai_login");
  });

  it("returns fallback for any other value", () => {
    expect(asCodexAuthMode("api_key", "api_key")).toBe("api_key");
    expect(asCodexAuthMode("unknown", "api_key")).toBe("api_key");
    expect(asCodexAuthMode(null, "api_key")).toBe("api_key");
    expect(asCodexAuthMode(undefined, "api_key")).toBe("api_key");
  });
});

describe("normalizeCodexProvider", () => {
  it("returns null for empty object", () => {
    expect(normalizeCodexProvider({})).toBe(null);
  });

  it("returns null for non-object", () => {
    expect(normalizeCodexProvider(null)).toBe(null);
    expect(normalizeCodexProvider("str")).toBe(null);
  });

  it("normalizes a provider config", () => {
    const raw = {
      id: "my-provider",
      name: "My Provider",
      base_url: "https://api.example.com",
      env_key: "MY_API_KEY",
      wire_api: "openai",
      requires_openai_auth: false,
      http_headers: { "X-Custom": "value" },
      env_http_headers: { Authorization: "AUTH_HEADER_ENV" },
      query_params: { version: "v1" },
    };
    const result = normalizeCodexProvider(raw);
    expect(result).not.toBe(null);
    expect(result?.id).toBe("my-provider");
    expect(result?.name).toBe("My Provider");
    expect(result?.baseUrl).toBe("https://api.example.com");
    expect(result?.envKey).toBe("MY_API_KEY");
    expect(result?.wireApi).toBe("openai");
    expect(result?.requiresOpenaiAuth).toBe(false);
    expect(result?.httpHeaders).toEqual({ "X-Custom": "value" });
    expect(result?.envHttpHeaders).toEqual({ Authorization: "AUTH_HEADER_ENV" });
  });

  it("returns null for optional fields when missing", () => {
    const result = normalizeCodexProvider({ base_url: "https://api.example.com" });
    expect(result?.id).toBe(null);
    expect(result?.name).toBe(null);
    expect(result?.envKey).toBe(null);
    expect(result?.envKeyInstructions).toBe(null);
    expect(result?.wireApi).toBe(null);
  });

  it("defaults requiresOpenaiAuth to false", () => {
    const result = normalizeCodexProvider({ base_url: "https://api.example.com" });
    expect(result?.requiresOpenaiAuth).toBe(false);
  });

  it("sets requiresOpenaiAuth to true when configured", () => {
    const result = normalizeCodexProvider({
      base_url: "https://api.example.com",
      requires_openai_auth: true,
    });
    expect(result?.requiresOpenaiAuth).toBe(true);
  });

  it("normalizes envKeyInstructions", () => {
    const result = normalizeCodexProvider({
      base_url: "https://api.example.com",
      env_key_instructions: "Set this key in .env",
    });
    expect(result?.envKeyInstructions).toBe("Set this key in .env");
  });

  it("resolves base_url through secretResolver", () => {
    const resolver = (name: string) => (name === "PROVIDER_URL" ? "https://resolved.example.com" : undefined);
    const result = normalizeCodexProvider({ base_url: "$SECRET:PROVIDER_URL" }, resolver);
    expect(result?.baseUrl).toBe("https://resolved.example.com");
  });
});

describe("normalizeNotifications", () => {
  it("returns null slack when no webhook_url", () => {
    const result = normalizeNotifications({});
    expect(result.slack).toBe(null);
  });

  it("normalizes slack config with webhook url", () => {
    const result = normalizeNotifications({
      slack: { webhook_url: "https://hooks.slack.com/xxx", verbosity: "verbose" },
    });
    expect(result.slack).not.toBe(null);
    expect(result.slack?.webhookUrl).toBe("https://hooks.slack.com/xxx");
    expect(result.slack?.verbosity).toBe("verbose");
  });

  it("defaults verbosity to critical for unknown values", () => {
    const result = normalizeNotifications({
      slack: { webhook_url: "https://hooks.slack.com/xxx", verbosity: "unknown" },
    });
    expect(result.slack?.verbosity).toBe("critical");
  });

  it("accepts off verbosity", () => {
    const result = normalizeNotifications({ slack: { webhook_url: "https://hooks.slack.com/xxx", verbosity: "off" } });
    expect(result.slack?.verbosity).toBe("off");
  });

  it("defaults to critical verbosity when not specified", () => {
    const result = normalizeNotifications({ slack: { webhook_url: "https://hooks.slack.com/xxx" } });
    expect(result.slack?.verbosity).toBe("critical");
  });

  it("accepts critical verbosity explicitly", () => {
    const result = normalizeNotifications({
      slack: { webhook_url: "https://hooks.slack.com/xxx", verbosity: "critical" },
    });
    expect(result.slack?.verbosity).toBe("critical");
  });

  it("falls back to critical when verbosity is a non-string value", () => {
    // When verbosity is not provided, asString defaults to "critical"
    // This tests the fallback string in asString(slack.verbosity, "critical")
    const result = normalizeNotifications({
      slack: { webhook_url: "https://hooks.slack.com/xxx", verbosity: 42 },
    });
    expect(result.slack?.verbosity).toBe("critical");
  });
});

describe("normalizeGitHub", () => {
  it("returns null when no token is configured", () => {
    expect(normalizeGitHub({})).toBe(null);
    expect(normalizeGitHub(null)).toBe(null);
  });

  it("normalizes github config with token", () => {
    const result = normalizeGitHub({ token: "ghp_token123", api_base_url: "https://api.github.enterprise.com" });
    expect(result).not.toBe(null);
    expect(result?.token).toBe("ghp_token123");
    expect(result?.apiBaseUrl).toBe("https://api.github.enterprise.com");
  });

  it("defaults apiBaseUrl to https://api.github.com", () => {
    const result = normalizeGitHub({ token: "ghp_token" });
    expect(result?.apiBaseUrl).toBe("https://api.github.com");
  });
});

describe("normalizeRepos", () => {
  it("returns empty array for non-array input", () => {
    expect(normalizeRepos(null)).toEqual([]);
    expect(normalizeRepos({})).toEqual([]);
  });

  it("filters repos without repoUrl", () => {
    const raw = [{ identifier_prefix: "MT" }];
    expect(normalizeRepos(raw)).toEqual([]);
  });

  it("filters repos without identifierPrefix or label", () => {
    const raw = [{ repo_url: "https://github.com/org/repo" }];
    expect(normalizeRepos(raw)).toEqual([]);
  });

  it("normalizes a valid repo config with identifier prefix", () => {
    const raw = [
      {
        repo_url: "https://github.com/org/repo",
        identifier_prefix: "MT",
        default_branch: "develop",
        github_owner: "org",
        github_repo: "repo",
      },
    ];
    const result = normalizeRepos(raw);
    expect(result).toHaveLength(1);
    expect(result[0].repoUrl).toBe("https://github.com/org/repo");
    expect(result[0].identifierPrefix).toBe("MT");
    expect(result[0].defaultBranch).toBe("develop");
    expect(result[0].githubOwner).toBe("org");
    expect(result[0].githubRepo).toBe("repo");
    expect(result[0].label).toBe(null);
  });

  it("accepts repos with label instead of identifierPrefix", () => {
    const raw = [{ repo_url: "https://github.com/org/repo", label: "backend" }];
    const result = normalizeRepos(raw);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("backend");
    expect(result[0].identifierPrefix).toBe(null);
  });

  it("defaults defaultBranch to main", () => {
    const raw = [{ repo_url: "https://github.com/org/repo", identifier_prefix: "MT" }];
    expect(normalizeRepos(raw)[0].defaultBranch).toBe("main");
  });

  it("defaults githubTokenEnv to null when not provided", () => {
    const raw = [{ repo_url: "https://github.com/org/repo", identifier_prefix: "MT" }];
    expect(normalizeRepos(raw)[0].githubTokenEnv).toBe(null);
  });

  it("passes through githubTokenEnv when provided", () => {
    const raw = [
      { repo_url: "https://github.com/org/repo", identifier_prefix: "MT", github_token_env: "GH_TOKEN_REPO" },
    ];
    expect(normalizeRepos(raw)[0].githubTokenEnv).toBe("GH_TOKEN_REPO");
  });
});

describe("normalizeStateMachine", () => {
  it("returns null for empty or missing stages", () => {
    expect(normalizeStateMachine({})).toBe(null);
    expect(normalizeStateMachine({ stages: [] })).toBe(null);
    expect(normalizeStateMachine(null)).toBe(null);
  });

  it("normalizes valid stages", () => {
    const raw = {
      stages: [
        { name: "Backlog", kind: "backlog" },
        { name: "In Progress", kind: "active" },
        { name: "Done", kind: "terminal" },
      ],
    };
    const result = normalizeStateMachine(raw);
    expect(result).not.toBe(null);
    expect(result?.stages).toHaveLength(3);
    expect(result?.stages[0]).toEqual({ name: "Backlog", kind: "backlog" });
    expect(result?.stages[2]).toEqual({ name: "Done", kind: "terminal" });
  });

  it("filters out stages with invalid kind", () => {
    const raw = {
      stages: [
        { name: "Good", kind: "active" },
        { name: "Bad", kind: "invalid_kind" },
      ],
    };
    const result = normalizeStateMachine(raw);
    expect(result?.stages).toHaveLength(1);
    expect(result?.stages[0].name).toBe("Good");
  });

  it("returns null when all stages are invalid", () => {
    const raw = { stages: [{ name: "Bad", kind: "invalid" }] };
    expect(normalizeStateMachine(raw)).toBe(null);
  });

  it("normalizes transitions map", () => {
    const raw = {
      stages: [
        { name: "Triage", kind: "todo" },
        { name: "Done", kind: "terminal" },
      ],
      transitions: { Triage: ["Done"] },
    };
    const result = normalizeStateMachine(raw);
    expect(result?.transitions).toEqual({ Triage: ["Done"] });
  });

  it("accepts todo kind stages", () => {
    const raw = { stages: [{ name: "Triage", kind: "todo" }] };
    const result = normalizeStateMachine(raw);
    expect(result?.stages).toHaveLength(1);
    expect(result?.stages[0]).toEqual({ name: "Triage", kind: "todo" });
  });

  it("accepts gate kind stages", () => {
    const raw = { stages: [{ name: "Review", kind: "gate" }] };
    const result = normalizeStateMachine(raw);
    expect(result?.stages).toHaveLength(1);
    expect(result?.stages[0]).toEqual({ name: "Review", kind: "gate" });
  });

  it("filters out stages with missing name", () => {
    const raw = { stages: [{ name: "", kind: "active" }] };
    expect(normalizeStateMachine(raw)).toBe(null);
  });

  it("returns empty transitions array for missing transition targets", () => {
    const raw = {
      stages: [{ name: "Active", kind: "active" }],
      transitions: { Active: null },
    };
    const result = normalizeStateMachine(raw);
    expect(result?.transitions).toEqual({ Active: [] });
  });
});

describe("normalizeApprovalPolicy", () => {
  it("passes through string values", () => {
    expect(normalizeApprovalPolicy("never")).toBe("never");
    expect(normalizeApprovalPolicy("auto-edit")).toBe("auto-edit");
  });

  it("returns the record when non-empty", () => {
    const policy = { approve: { rules: true } };
    expect(normalizeApprovalPolicy(policy)).toEqual(policy);
  });

  it("returns default policy for empty object", () => {
    const result = normalizeApprovalPolicy({}) as Record<string, unknown>;
    expect(result).toHaveProperty("reject");
    const reject = result.reject as Record<string, unknown>;
    expect(reject.sandbox_approval).toBe(true);
    expect(reject.rules).toBe(true);
    expect(reject.mcp_elicitations).toBe(true);
  });

  it("returns default policy for non-string, non-object input", () => {
    const result = normalizeApprovalPolicy(null) as Record<string, unknown>;
    expect(result).toHaveProperty("reject");
  });
});

describe("asReasoningEffort", () => {
  it("returns valid effort values", () => {
    for (const effort of ["none", "minimal", "low", "medium", "high", "xhigh"] as const) {
      expect(asReasoningEffort(effort, null)).toBe(effort);
    }
  });

  it("returns fallback for null specifically", () => {
    expect(asReasoningEffort(null, "high")).toBe("high");
  });

  it("returns fallback for undefined specifically", () => {
    expect(asReasoningEffort(undefined, "medium")).toBe("medium");
  });

  it("returns fallback for empty string specifically", () => {
    expect(asReasoningEffort("", "low")).toBe("low");
  });

  it("returns fallback for non-string", () => {
    expect(asReasoningEffort(42, "high")).toBe("high");
    expect(asReasoningEffort({}, null)).toBe(null);
  });

  it("returns fallback for invalid string", () => {
    expect(asReasoningEffort("ultra", "high")).toBe("high");
    expect(asReasoningEffort("maximum", null)).toBe(null);
  });

  it("returns null fallback when value is null and fallback is null", () => {
    expect(asReasoningEffort(null, null)).toBe(null);
  });

  it("returns null fallback when value is undefined and fallback is null", () => {
    expect(asReasoningEffort(undefined, null)).toBe(null);
  });

  it("returns null fallback when value is empty string and fallback is null", () => {
    expect(asReasoningEffort("", null)).toBe(null);
  });

  it("distinguishes null from other falsy values", () => {
    // Each branch of the condition should be individually testable
    // null should return fallback even when fallback differs from all valid efforts
    expect(asReasoningEffort(null, "xhigh")).toBe("xhigh");
    expect(asReasoningEffort(null, "none")).toBe("none");
  });

  it("distinguishes undefined from other falsy values", () => {
    expect(asReasoningEffort(undefined, "xhigh")).toBe("xhigh");
    expect(asReasoningEffort(undefined, "none")).toBe("none");
  });

  it("distinguishes empty string from null and undefined", () => {
    expect(asReasoningEffort("", "xhigh")).toBe("xhigh");
    expect(asReasoningEffort("", "none")).toBe("none");
  });

  it("returns fallback only for null/undefined/empty, not for valid strings", () => {
    // Ensure that non-null, non-undefined, non-empty values that are valid pass through
    expect(asReasoningEffort("high", "low")).toBe("high");
    // And invalid non-empty strings also return fallback
    expect(asReasoningEffort("invalid", "low")).toBe("low");
  });
});

describe("normalizeTurnSandboxPolicy", () => {
  it("returns default policy for empty object", () => {
    const result = normalizeTurnSandboxPolicy({});
    expect(result.type).toBe("workspaceWrite");
    expect(result.writableRoots).toEqual([]);
    expect(result.networkAccess).toBe(false);
    expect(result.readOnlyAccess).toEqual({ type: "fullAccess" });
  });

  it("passes through non-empty policy with type override", () => {
    const input = { type: "dangerFullAccess", networkAccess: true };
    const result = normalizeTurnSandboxPolicy(input);
    expect(result.type).toBe("dangerFullAccess");
    expect(result.networkAccess).toBe(true);
  });

  it("falls back to workspaceWrite type when type is missing from non-empty object", () => {
    const result = normalizeTurnSandboxPolicy({ networkAccess: false });
    expect(result.type).toBe("workspaceWrite");
  });
});
