/**
 * PR Review Feedback Ingester
 *
 * Fetches review bodies, PR-level comments, and inline line-level comments for
 * an open pull request and formats them for injection into the agent prompt.
 *
 * Used when re-running an issue that already has an open PR with reviewer
 * feedback — the formatted feedback section is prepended to the prompt under
 * a "Previous PR Review Feedback" heading so the agent can address all
 * reviewer concerns in the follow-up run.
 */

export interface PRReviewFeedback {
  prNumber: number;
  prUrl: string;
  reviews: Array<{
    author: string;
    state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED";
    body: string;
  }>;
  /** PR-level (issue) comments — not attached to a specific line. */
  comments: Array<{
    author: string;
    body: string;
  }>;
  /** Inline review comments attached to a specific file and line. */
  inlineComments: Array<{
    author: string;
    path: string;
    body: string;
  }>;
}

/** Narrows an unknown review state string to the allowed union. */
function isKnownReviewState(state: string): state is "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" {
  return state === "APPROVED" || state === "CHANGES_REQUESTED" || state === "COMMENTED";
}

type ExecFileAsyncFn = (cmd: string, args: string[]) => Promise<{ stdout: string }>;

/** Loads a promisified execFile from Node built-ins (dynamic import to allow test mocking). */
async function makeExecFileAsync(): Promise<ExecFileAsyncFn> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  return promisify(execFile) as ExecFileAsyncFn;
}

/**
 * Calls `gh pr list` to find the open PR number and URL for `branchName`.
 * Returns `null` when no PR exists or on any error.
 */
async function findOpenPr(
  execFileAsync: ExecFileAsyncFn,
  repo: string,
  branchName: string,
): Promise<{ prNumber: number; prUrl: string } | null> {
  try {
    const result = await execFileAsync("gh", [
      "pr",
      "list",
      "--repo",
      repo,
      "--head",
      branchName,
      "--state",
      "open",
      "--json",
      "number,url",
      "--limit",
      "1",
    ]);
    const parsed: unknown = JSON.parse(result.stdout.trim() || "[]");
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    const first = parsed[0] as Record<string, unknown>;
    if (typeof first["number"] !== "number" || typeof first["url"] !== "string") {
      return null;
    }
    return { prNumber: first["number"], prUrl: first["url"] };
  } catch {
    return null;
  }
}

interface RawPrPayload {
  reviewsRaw: unknown;
  commentsRaw: unknown;
  reviewThreadsRaw: unknown;
}

/**
 * Calls `gh pr view` to fetch reviews, comments, and reviewThreads for `prNumber`.
 * Returns `null` on any error or unexpected payload shape.
 */
async function fetchRawPrPayload(
  execFileAsync: ExecFileAsyncFn,
  repo: string,
  prNumber: number,
): Promise<RawPrPayload | null> {
  try {
    const result = await execFileAsync("gh", [
      "pr",
      "view",
      String(prNumber),
      "--repo",
      repo,
      "--json",
      "reviews,comments,reviewThreads",
    ]);
    const viewPayload: unknown = JSON.parse(result.stdout.trim() || "{}");
    if (typeof viewPayload !== "object" || viewPayload === null) {
      return null;
    }
    const payload = viewPayload as Record<string, unknown>;
    return {
      reviewsRaw: payload["reviews"],
      commentsRaw: payload["comments"],
      reviewThreadsRaw: payload["reviewThreads"],
    };
  } catch {
    return null;
  }
}

/** Parses the raw `reviews` array from `gh pr view` into typed review objects. */
function parseReviews(reviewsRaw: unknown): PRReviewFeedback["reviews"] {
  const reviews: PRReviewFeedback["reviews"] = [];
  if (!Array.isArray(reviewsRaw)) {
    return reviews;
  }
  for (const item of reviewsRaw) {
    if (!isGithubReviewPayload(item)) continue;
    const body = item.body.trim();
    if (!body) continue;
    const state = item.state.toUpperCase();
    if (!isKnownReviewState(state)) continue;
    const author = item.user?.login ?? "unknown";
    reviews.push({ author, state, body });
  }
  return reviews;
}

/** Parses the raw `comments` array from `gh pr view` into typed comment objects. */
function parseComments(commentsRaw: unknown): PRReviewFeedback["comments"] {
  const comments: PRReviewFeedback["comments"] = [];
  if (!Array.isArray(commentsRaw)) {
    return comments;
  }
  for (const item of commentsRaw) {
    if (!isGithubCommentPayload(item)) continue;
    const body = item.body.trim();
    if (!body) continue;
    const author = item.user?.login ?? "unknown";
    comments.push({ author, body });
  }
  return comments;
}

/** Extracts the login from a review thread comment's `author` field. */
function extractThreadCommentAuthor(tc: Record<string, unknown>): string {
  const authorObj = tc["author"];
  if (typeof authorObj === "object" && authorObj !== null && "login" in authorObj) {
    return String((authorObj as Record<string, unknown>)["login"]);
  }
  return "unknown";
}

/**
 * Parses a single review-thread comment object into an inline comment entry.
 * Returns `null` when the comment should be skipped (empty body or wrong shape).
 */
function parseThreadComment(threadComment: unknown): PRReviewFeedback["inlineComments"][number] | null {
  if (typeof threadComment !== "object" || threadComment === null) return null;
  const tc = threadComment as Record<string, unknown>;
  const body = typeof tc["body"] === "string" ? tc["body"].trim() : "";
  if (!body) return null;
  const path = typeof tc["path"] === "string" ? tc["path"] : "";
  const author = extractThreadCommentAuthor(tc);
  return { author, path, body };
}

/**
 * Parses the raw `reviewThreads` array from `gh pr view` into typed inline
 * comment objects.
 *
 * The `gh pr view --json reviewThreads` format is:
 *   `{ reviewThreads: [{ comments: [{ body, path, author: { login } }] }] }`
 */
function parseInlineComments(reviewThreadsRaw: unknown): PRReviewFeedback["inlineComments"] {
  const inlineComments: PRReviewFeedback["inlineComments"] = [];
  if (!Array.isArray(reviewThreadsRaw)) {
    return inlineComments;
  }
  for (const thread of reviewThreadsRaw) {
    if (typeof thread !== "object" || thread === null) continue;
    const threadComments = (thread as Record<string, unknown>)["comments"];
    if (!Array.isArray(threadComments)) continue;
    for (const raw of threadComments) {
      const parsed = parseThreadComment(raw);
      if (parsed) inlineComments.push(parsed);
    }
  }
  return inlineComments;
}

/**
 * Formats a `PRReviewFeedback` object into a Markdown section suitable for
 * injection into the agent prompt as "Previous PR Review Feedback".
 *
 * Returns an empty string when the feedback object contains no reviews,
 * comments, or inline comments.
 */
export function formatPRFeedbackForPrompt(feedback: PRReviewFeedback): string {
  const lines: string[] = [];

  lines.push(`## Previous PR Review Feedback`);
  lines.push("", `Pull Request: [#${feedback.prNumber}](${feedback.prUrl})`, "");

  const hasContent = feedback.reviews.length > 0 || feedback.comments.length > 0 || feedback.inlineComments.length > 0;

  if (!hasContent) {
    return "";
  }

  if (feedback.reviews.length > 0) {
    lines.push(`### Reviews`, ``);
    for (const review of feedback.reviews) {
      lines.push(`**@${review.author}** (${review.state}):`, review.body, ``);
    }
  }

  if (feedback.comments.length > 0) {
    lines.push(`### PR Comments`, ``);
    for (const comment of feedback.comments) {
      lines.push(`**@${comment.author}**:`, comment.body, ``);
    }
  }

  if (feedback.inlineComments.length > 0) {
    lines.push(`### Inline Review Comments`, ``);
    for (const inline of feedback.inlineComments) {
      lines.push(`**@${inline.author}** on \`${inline.path}\`:`, inline.body, ``);
    }
  }

  return lines.join("\n");
}

/**
 * Raw GitHub API shape for a pull request review (GET /pulls/{n}/reviews).
 * Only the fields we care about are typed here.
 */
interface GithubReviewPayload {
  state: string;
  body: string;
  user?: { login?: string };
}

/**
 * Raw GitHub API shape for a PR-level or inline review comment.
 */
interface GithubCommentPayload {
  body: string;
  user?: { login?: string };
  /** Present on inline review comments; absent on PR-level (issue) comments. */
  path?: string;
}

function isGithubReviewPayload(value: unknown): value is GithubReviewPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "state" in value &&
    typeof (value as Record<string, unknown>)["state"] === "string" &&
    "body" in value &&
    typeof (value as Record<string, unknown>)["body"] === "string"
  );
}

function isGithubCommentPayload(value: unknown): value is GithubCommentPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "body" in value &&
    typeof (value as Record<string, unknown>)["body"] === "string"
  );
}

/**
 * Fetches PR review feedback for the open pull request on `branchName` in
 * `repo` (format: `owner/repo`).
 *
 * Returns `null` when:
 * - No open PR exists for the branch.
 * - The GitHub CLI (`gh`) is unavailable or not authenticated.
 * - Any network or API error occurs (logged at warn by the caller).
 *
 * The function is deliberately non-throwing — callers must handle the `null`
 * case as a graceful-degradation path.
 */
export async function fetchPRReviewFeedback(repo: string, branchName: string): Promise<PRReviewFeedback | null> {
  const execFileAsync = await makeExecFileAsync();

  const prRef = await findOpenPr(execFileAsync, repo, branchName);
  if (!prRef) {
    return null;
  }

  const rawPayload = await fetchRawPrPayload(execFileAsync, repo, prRef.prNumber);
  if (!rawPayload) {
    return null;
  }

  return {
    prNumber: prRef.prNumber,
    prUrl: prRef.prUrl,
    reviews: parseReviews(rawPayload.reviewsRaw),
    comments: parseComments(rawPayload.commentsRaw),
    inlineComments: parseInlineComments(rawPayload.reviewThreadsRaw),
  };
}
