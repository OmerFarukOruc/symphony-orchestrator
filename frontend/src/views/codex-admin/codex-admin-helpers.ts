import { toast } from "../../ui/toast.js";
import type {
  CodexAdminSnapshotResponse,
  CodexCapabilities,
  CodexCollaborationModeEntry,
  CodexUserInputRequest,
  CodexUserInputQuestion,
} from "../../types/codex.js";

export type CodexAdminData = CodexAdminSnapshotResponse;

export function formatUnixSeconds(value: number | null | undefined): string {
  if (!value) return "\u2014";
  return new Date(value * 1000).toLocaleString();
}

export function capabilityCounts(capabilities: CodexCapabilities): {
  supported: number;
  unsupported: number;
  unknown: number;
} {
  const counts = { supported: 0, unsupported: 0, unknown: 0 };
  for (const value of Object.values(capabilities.methods)) {
    if (value === "supported") counts.supported += 1;
    else if (value === "unsupported") counts.unsupported += 1;
    else counts.unknown += 1;
  }
  return counts;
}

export function normalizeCollaborationModes(
  value: { data?: CodexCollaborationModeEntry[] } | CodexCollaborationModeEntry[],
): CodexCollaborationModeEntry[] {
  if (Array.isArray(value)) {
    return value;
  }
  return Array.isArray(value.data) ? value.data : [];
}

export function buildQuestionPrompt(question: CodexUserInputQuestion): string {
  const heading = question.header ?? question.question;
  const lines = heading === question.question ? [heading] : [heading, question.question];
  if (question.options?.length) {
    lines.push(
      "",
      ...question.options.map((option, index) => {
        const suffix = option.description ? ` — ${option.description}` : "";
        return `${index + 1}. ${option.label}${suffix}`;
      }),
    );
  }
  return lines.join("\n");
}

export function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

export async function runCodexAdminAction(
  work: () => Promise<unknown>,
  successMessage: string,
  errorFallback: string,
  onRefresh?: () => Promise<void>,
): Promise<void> {
  try {
    await work();
    toast(successMessage, "success");
    await onRefresh?.();
  } catch (error) {
    toast(formatErrorMessage(error, errorFallback), "error");
  }
}

export async function promptForUserInput(request: CodexUserInputRequest): Promise<unknown | null> {
  const answers: Array<{ id: string; value: string }> = [];
  for (const question of request.questions) {
    const promptText = buildQuestionPrompt(question);
    const value = globalThis.prompt?.(promptText, question.options?.[0]?.label ?? "");
    if (value === null || value === undefined) {
      return null;
    }
    answers.push({ id: question.id, value });
  }
  return { answers };
}

export function createMetric(label: string, value: string, hint?: string): HTMLElement {
  const item = document.createElement("div");
  item.className = "codex-admin-metric";
  const kicker = document.createElement("span");
  kicker.className = "codex-admin-metric-label";
  kicker.textContent = label;
  const strong = document.createElement("strong");
  strong.className = "codex-admin-metric-value";
  strong.textContent = value;
  item.append(kicker, strong);
  if (hint) {
    const note = document.createElement("span");
    note.className = "codex-admin-metric-hint";
    note.textContent = hint;
    item.append(note);
  }
  return item;
}

export function createTag(text: string, tone: "default" | "success" | "warn" = "default"): HTMLElement {
  const tag = document.createElement("span");
  tag.className = `mc-badge codex-admin-tag is-${tone}`;
  tag.textContent = text;
  return tag;
}

export function createPanel(title: string, description: string, actions: HTMLElement[] = []): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "mc-panel codex-admin-panel";
  const header = document.createElement("div");
  header.className = "settings-section-header";
  const row = document.createElement("div");
  row.className = "settings-section-header-row";
  const copy = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = title;
  const desc = document.createElement("p");
  desc.textContent = description;
  copy.append(heading, desc);
  row.append(copy);
  if (actions.length > 0) {
    const actionWrap = document.createElement("div");
    actionWrap.className = "settings-section-header-actions";
    actionWrap.append(...actions);
    row.append(actionWrap);
  }
  header.append(row);
  panel.append(header);
  return panel;
}
