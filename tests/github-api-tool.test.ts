import { describe, expect, it, vi } from "vitest";

import { handleGithubApiToolCall, type GithubApiToolClient } from "../src/github-api-tool.js";

describe("handleGithubApiToolCall", () => {
  it("calls get_pr_status and returns success response", async () => {
    const client: GithubApiToolClient = {
      addPrComment: vi.fn(),
      getPrStatus: vi.fn(async () => ({ state: "open", checks: "pending" })),
    };

    const response = await handleGithubApiToolCall(client, {
      action: "get_pr_status",
      owner: "acme",
      repo: "backend",
      pullNumber: 42,
    });

    expect(response.success).toBe(true);
    expect(response.contentItems[0]).toEqual({
      type: "inputText",
      text: JSON.stringify({ state: "open", checks: "pending" }),
    });
    expect(client.getPrStatus).toHaveBeenCalledWith({
      owner: "acme",
      repo: "backend",
      pullNumber: 42,
    });
  });

  it("calls add_pr_comment and returns success response", async () => {
    const client: GithubApiToolClient = {
      addPrComment: vi.fn(async () => ({ id: 99, body: "looks good" })),
      getPrStatus: vi.fn(),
    };

    const response = await handleGithubApiToolCall(client, {
      action: "add_pr_comment",
      owner: "acme",
      repo: "backend",
      pullNumber: 42,
      body: "looks good",
    });

    expect(response.success).toBe(true);
    expect(response.contentItems[0]).toEqual({
      type: "inputText",
      text: JSON.stringify({ id: 99, body: "looks good" }),
    });
    expect(client.addPrComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "backend",
      pullNumber: 42,
      body: "looks good",
    });
  });

  it("rejects unsupported actions", async () => {
    const client: GithubApiToolClient = {
      addPrComment: vi.fn(),
      getPrStatus: vi.fn(),
    };

    const response = await handleGithubApiToolCall(client, {
      action: "merge_pr",
      owner: "acme",
      repo: "backend",
      pullNumber: 42,
    });

    expect(response.success).toBe(false);
    expect(JSON.parse(response.contentItems[0].text)).toEqual({
      error: "unsupported github_api action: merge_pr",
    });
  });

  it("rejects malformed input", async () => {
    const client: GithubApiToolClient = {
      addPrComment: vi.fn(),
      getPrStatus: vi.fn(),
    };

    const response = await handleGithubApiToolCall(client, {
      action: "get_pr_status",
      owner: "acme",
      repo: "backend",
      pullNumber: "not-a-number",
    });

    expect(response.success).toBe(false);
    expect(JSON.parse(response.contentItems[0].text)).toEqual({
      error: "github_api expects { action, owner, repo, pullNumber, ... }",
    });
  });

  it("surfaces downstream client failures in error payload", async () => {
    const client: GithubApiToolClient = {
      addPrComment: vi.fn(async () => {
        throw new Error("github unavailable");
      }),
      getPrStatus: vi.fn(),
    };

    const response = await handleGithubApiToolCall(client, {
      action: "add_pr_comment",
      owner: "acme",
      repo: "backend",
      pullNumber: 7,
      body: "ping",
    });

    expect(response.success).toBe(false);
    expect(JSON.parse(response.contentItems[0].text)).toEqual({
      error: "github unavailable",
    });
  });
});
