import { asRecord } from "./utils/type-guards.js";

export type GithubApiAction = "add_pr_comment" | "get_pr_status";

interface GithubApiInputBase {
  action: GithubApiAction;
  owner: string;
  repo: string;
  pullNumber: number;
}

interface AddPrCommentInput extends GithubApiInputBase {
  action: "add_pr_comment";
  body: string;
}

interface GetPrStatusInput extends GithubApiInputBase {
  action: "get_pr_status";
}

type GithubApiInput = AddPrCommentInput | GetPrStatusInput;

export interface GithubApiToolClient {
  addPrComment(input: { owner: string; repo: string; pullNumber: number; body: string }): Promise<unknown>;
  getPrStatus(input: { owner: string; repo: string; pullNumber: number }): Promise<unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asPullNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function parseInput(args: unknown): GithubApiInput {
  const input = asRecord(args);
  const action = asString(input.action);
  const owner = asString(input.owner);
  const repo = asString(input.repo);
  const pullNumber = asPullNumber(input.pullNumber);

  if (!action || !owner || !repo || pullNumber === null) {
    throw new Error("github_api expects { action, owner, repo, pullNumber, ... }");
  }

  if (action === "add_pr_comment") {
    const body = asString(input.body);
    if (!body) {
      throw new Error("github_api add_pr_comment requires a non-empty body");
    }
    return {
      action,
      owner,
      repo,
      pullNumber,
      body,
    };
  }

  if (action === "get_pr_status") {
    return {
      action,
      owner,
      repo,
      pullNumber,
    };
  }

  throw new Error(`unsupported github_api action: ${action}`);
}

function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

export async function handleGithubApiToolCall(
  client: GithubApiToolClient,
  args: unknown,
): Promise<{ success: boolean; contentItems: Array<{ type: "inputText"; text: string }> }> {
  try {
    const input = parseInput(args);
    const response =
      input.action === "add_pr_comment"
        ? await client.addPrComment({
            owner: input.owner,
            repo: input.repo,
            pullNumber: input.pullNumber,
            body: input.body,
          })
        : await client.getPrStatus({
            owner: input.owner,
            repo: input.repo,
            pullNumber: input.pullNumber,
          });

    return {
      success: true,
      contentItems: [
        {
          type: "inputText",
          text: jsonText(response),
        },
      ],
    };
  } catch (error) {
    return {
      success: false,
      contentItems: [
        {
          type: "inputText",
          text: jsonText({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
    };
  }
}
