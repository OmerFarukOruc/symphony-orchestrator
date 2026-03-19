import { api } from "../api";
import type { IssueDetail } from "../types";
import { router } from "../router";
import { statusChip } from "../ui/status-chip";
import { toast } from "../ui/toast";
import { flashDiff, setTextWithDiff } from "../utils/diff";
import { createAttemptsTable } from "./attempts-table";
import { createEventRow } from "./event-row";
import { createEmptyState } from "./empty-state";
import { computeDurationSeconds, formatCompactNumber, formatDuration, formatTimestamp } from "../utils/format";

function kv(label: string, value: string): HTMLElement {
  const item = document.createElement("div");
  item.className = "issue-meta-item";
  const caption = document.createElement("span");
  caption.className = "text-secondary";
  caption.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  item.append(caption, strong);
  return item;
}

function button(label: string, onClick: () => void, variant = "mc-button-ghost"): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `mc-button ${variant}`;
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

export function buildDescriptionSection(detail: IssueDetail): HTMLElement {
  const section = document.createElement("section");
  section.className = "issue-section mc-panel expand-in";
  section.append(Object.assign(document.createElement("h2"), { textContent: "Description & blockers" }));
  const body = document.createElement("div");
  body.className = detail.description ? "issue-body-copy" : "issue-placeholder";
  body.textContent = detail.description?.trim() || "Not exposed yet";
  section.append(body);
  if ((detail.blocked_by ?? []).length > 0) {
    const blockers = document.createElement("div");
    blockers.className = "issue-blocker-list";
    detail.blocked_by?.forEach((identifier) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "overview-row";
      item.append(Object.assign(document.createElement("strong"), { textContent: identifier }), statusChip("blocked"));
      item.addEventListener("click", () => router.navigate(`/issues/${identifier}`));
      blockers.append(item);
    });
    section.append(blockers);
  }
  return section;
}

export function buildWorkspaceSection(detail: IssueDetail): HTMLElement {
  const section = document.createElement("section");
  section.className = "issue-section mc-panel expand-in";
  section.append(Object.assign(document.createElement("h2"), { textContent: "Run / workspace / git" }));
  const grid = document.createElement("div");
  grid.className = "issue-meta-grid";
  grid.append(
    kv("Workspace", detail.workspacePath ?? "Not available"),
    kv("Branch", detail.branch_name ?? "—"),
    kv("Pull request", detail.pull_request_url ?? "—"),
    kv("Tokens", formatCompactNumber(detail.tokenUsage?.totalTokens ?? null)),
    kv("Duration", formatDuration(computeDurationSeconds(detail.startedAt, detail.updated_at ?? detail.updatedAt))),
    kv("Last event", formatTimestamp(detail.lastEventAt ?? detail.updated_at ?? detail.updatedAt)),
  );
  const actions = document.createElement("div");
  actions.className = "mc-actions";
  actions.append(
    button("Copy workspace path", async () => {
      await navigator.clipboard.writeText(detail.workspacePath ?? "");
      toast("Workspace path copied.", "success");
    }),
  );
  section.append(grid, actions);
  return section;
}

export function buildModelSection(detail: IssueDetail): HTMLElement {
  const section = document.createElement("section");
  section.className = "issue-section mc-panel expand-in";
  section.append(Object.assign(document.createElement("h2"), { textContent: "Model routing" }));

  const active = document.createElement("div");
  active.className = "issue-summary-strip";
  active.append(kv("Active model", detail.model ?? "—"), kv("Reasoning", detail.reasoningEffort ?? "—"));

  const form = document.createElement("form");
  form.className = "issue-form-grid";
  const modelInput = Object.assign(document.createElement("input"), {
    className: "mc-input",
    value: detail.configuredModel ?? detail.model ?? "",
    placeholder: "gpt-5.4",
  });
  const effortSelect = document.createElement("select");
  effortSelect.className = "mc-select";
  ["none", "low", "medium", "high"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value === "none" ? "" : value;
    option.textContent = value;
    effortSelect.append(option);
  });
  effortSelect.value = detail.configuredReasoningEffort ?? detail.reasoningEffort ?? "";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "mc-button mc-button-ghost";
  save.textContent = "Save";
  form.append(modelInput, effortSelect, save);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api.postModelOverride(detail.identifier, {
        model: modelInput.value.trim() || detail.model || "gpt-5.4",
        reasoningEffort: effortSelect.value,
      });
      toast("Model override saved for next run.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to save model override.", "error");
    }
  });

  const note = document.createElement("p");
  note.className = "text-secondary";
  note.textContent = detail.modelChangePending
    ? "Saved change pending — applies on the next run."
    : "Applies next run. Active worker keeps its current model.";
  section.append(active, form, note);
  return section;
}

export function buildHeaderActions(detail: IssueDetail): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "mc-actions";
  if (!detail.workspacePath) {
    return actions;
  }
  actions.append(
    button("Copy workspace path", async () => {
      await navigator.clipboard.writeText(detail.workspacePath ?? "");
      toast("Workspace path copied.", "success");
    }),
  );
  return actions;
}

export function buildActivitySection(detail: IssueDetail): HTMLElement {
  const section = document.createElement("section");
  section.className = "issue-section mc-panel expand-in";
  section.append(Object.assign(document.createElement("h2"), { textContent: "Activity" }));
  const list = document.createElement("div");
  list.className = "issue-activity-list";
  const events = detail.recentEvents.slice(0, 5);
  if (events.length === 0) {
    list.append(
      createEmptyState("No streamed activity", "Fresh issue detail will appear here once agents emit events."),
    );
  } else {
    events.forEach((event, index) => {
      const row = createEventRow(event, true);
      row.classList.add("stagger-item");
      row.style.setProperty("--stagger-index", String(index));
      list.append(row);
    });
  }
  const link = document.createElement("a");
  link.className = "mc-button mc-button-ghost";
  link.href = `/issues/${detail.identifier}/logs`;
  link.textContent = "View all logs →";
  section.append(list, link);
  return section;
}

export function buildAttemptsSection(detail: IssueDetail): HTMLElement {
  const section = document.createElement("section");
  section.className = "issue-section mc-panel expand-in";
  section.append(Object.assign(document.createElement("h2"), { textContent: "Attempts" }));
  section.append(createAttemptsTable(detail.attempts, (attemptId) => router.navigate(`/attempts/${attemptId}`)));
  return section;
}

export function createSummaryStat(label: string): {
  element: HTMLElement;
  update: (value: string) => void;
} {
  const element = document.createElement("div");
  element.className = "issue-summary-item";
  const caption = document.createElement("span");
  caption.className = "text-secondary";
  caption.textContent = label;
  const value = document.createElement("strong");
  element.append(caption, value);
  return {
    element,
    update: (nextValue: string) => {
      const before = value.textContent ?? "";
      setTextWithDiff(value, nextValue);
      if (before && before !== nextValue) {
        flashDiff(element);
      }
    },
  };
}
