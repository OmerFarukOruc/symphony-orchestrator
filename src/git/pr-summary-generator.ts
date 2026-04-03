/**
 * Agent-authored PR summary generator.
 *
 * Runs `codex exec` as a subprocess in read-only mode, feeds it the branch diff,
 * and returns a 3–8 bullet markdown summary of the changes. Returns null on any
 * failure so the caller can degrade gracefully (PR is still created without a summary).
 *
 * No Anthropic SDK — uses the existing Codex auth already configured on the host.
 */

import { spawn, execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Maximum diff size (bytes) accepted for summary generation. Diffs beyond this threshold
 *  are too large for a meaningful bullet summary and take disproportionate token budget. */
const MAX_DIFF_BYTES = 50 * 1024; // 50 KB

/** Wall-clock timeout for the codex exec subprocess (ms). */
const CODEX_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Run `git diff {defaultBranch}...HEAD` in the given directory and return the raw text.
 * Returns null if git is unavailable, the repo has no commits, or the command fails.
 */
async function getGitDiff(workspaceDir: string, defaultBranch: string): Promise<string | null> {
  const opts: ExecFileOptions = { cwd: workspaceDir, maxBuffer: MAX_DIFF_BYTES * 2, encoding: "utf8" };
  try {
    const { stdout } = await execFileAsync("git", ["diff", `${defaultBranch}...HEAD`], opts);
    if (typeof stdout !== "string") return null;
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Extract the agent message text from a single parsed JSONL event object.
 * Returns the text string when the event is a completed agent_message, or null otherwise.
 */
function extractAgentMessageText(obj: Record<string, unknown>): string | null {
  if (obj.type !== "item.completed") return null;
  if (obj.item === null || typeof obj.item !== "object") return null;
  const item = obj.item as Record<string, unknown>;
  if (item.type !== "agent_message") return null;
  const text = typeof item.text === "string" ? item.text : "";
  return text.length > 0 ? text : null;
}

/**
 * Parse JSONL lines from `codex exec --json` and return the final agent message text.
 * Follows the same event schema as the gstack codex-session-runner helper:
 * - `item.completed` with `item.type === "agent_message"` → collect text
 * Returns null when no agent message text was found.
 */
function parseCodexJsonlOutput(lines: string[]): string | null {
  const messageParts: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const text = extractAgentMessageText(obj);
      if (text !== null) {
        messageParts.push(text);
      }
    } catch {
      // Skip malformed lines — not fatal
    }
  }

  if (messageParts.length === 0) return null;
  return messageParts.join("\n");
}

/**
 * Spawn `codex exec` with `--json -s read-only`, stream JSONL from stdout,
 * and return the final agent message. Returns null on process errors or timeout.
 */
function runCodexExec(prompt: string, cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("codex", ["exec", prompt, "--json", "-s", "read-only"], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve(null);
      return;
    }

    const collectedLines: string[] = [];
    let buffer = "";
    let settled = false;

    const settle = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      settle(null);
    }, CODEX_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx >= 0) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (line.length > 0) {
          collectedLines.push(line);
        }
        newlineIdx = buffer.indexOf("\n");
      }
    });

    child.on("error", () => {
      settle(null);
    });

    child.on("exit", () => {
      // Flush any remaining buffered data
      if (buffer.trim().length > 0) {
        collectedLines.push(buffer.trim());
      }
      const output = parseCodexJsonlOutput(collectedLines);
      settle(output);
    });
  });
}

/**
 * Generate a 3–8 bullet markdown summary of branch changes using `codex exec`.
 *
 * @param workspaceDir - Absolute path to the workspace git repository.
 * @param defaultBranch - The base branch to diff against (e.g. "main").
 * @returns Markdown bullet string, or null if generation failed or was skipped.
 */
export async function generatePrSummary(workspaceDir: string, defaultBranch: string): Promise<string | null> {
  const diff = await getGitDiff(workspaceDir, defaultBranch);

  // Graceful degradation: no diff or diff too large
  if (diff === null || diff.trim().length === 0) return null;
  if (Buffer.byteLength(diff, "utf8") > MAX_DIFF_BYTES) return null;

  // Pass the diff content directly so codex doesn't need to re-run git.
  // Sanitize triple backticks in diff content to prevent breaking out of the markdown fence.
  const sanitizedDiff = diff.replace(/```/g, "`` ");
  const prompt =
    `Below is the output of \`git diff ${defaultBranch}...HEAD\`. Write a concise summary of ALL changes.\n\n` +
    "```diff\n" +
    sanitizedDiff +
    "\n```\n\n" +
    "RULES: Start immediately with the first bullet. Use flat markdown bullets only. " +
    "Each bullet: what was added/modified/fixed and where. 3-8 bullets max. " +
    "No headings. No intro text. No closing remarks.";

  const result = await runCodexExec(prompt, workspaceDir);

  // Validate the output looks like markdown bullets
  if (result === null) return null;
  const trimmed = result.trim();
  if (trimmed.length === 0) return null;
  if (!trimmed.startsWith("-") && !trimmed.startsWith("*")) return null;

  return trimmed;
}
