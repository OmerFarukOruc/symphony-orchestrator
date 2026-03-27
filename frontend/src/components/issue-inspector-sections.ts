import { api } from "../api";
import { REASONING_EFFORT_OPTIONS } from "../types";
import type { IssueDetail } from "../types";
import { router } from "../router";
import { statusChip } from "../ui/status-chip";
import { toast } from "../ui/toast";
import { createAttemptsTable } from "./attempts-table";
import { createButton, createField, createSelectControl } from "./forms.js";
import { createEventRow } from "./event-row";
import { createEmptyState } from "./empty-state";
import {
  computeDurationSeconds,
  formatCompactNumber,
  formatCostUsd,
  formatDuration,
  formatTimestamp,
} from "../utils/format";
import { applyStagger, button, kv } from "./issue-inspector-common.js";

export function buildDescriptionSection(detail: IssueDetail): HTMLElement {
  const section = document.createElement("section");
  section.className = "issue-section mc-panel expand-in";
  section.append(Object.assign(document.createElement("h2"), { textContent: "Description" }));
  const body = document.createElement("div");
  body.className = detail.description ? "issue-body-copy" : "issue-placeholder";
  body.textContent = detail.description?.trim() || "No description";
  section.append(body);
  if ((detail.blockedBy ?? []).length > 0) {
    section.append(Object.assign(document.createElement("h3"), { textContent: "Blocked by" }));
    const blockers = document.createElement("div");
    blockers.className = "issue-blocker-list";
    detail.blockedBy?.forEach((blocker) => {
      const identifier = blocker.identifier ?? blocker.id;
      if (!identifier) return;
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

function computeIssueCostUsd(detail: IssueDetail): number | null {
  const total = detail.attempts.reduce<number | null>((acc, attempt) => {
    if (attempt.costUsd === null || attempt.costUsd === undefined) return acc;
    return (acc ?? 0) + attempt.costUsd;
  }, null);
  return total;
}

export function buildWorkspaceSection(detail: IssueDetail): HTMLElement {
  const section = document.createElement("section");
  section.className = "issue-section mc-panel expand-in";
  section.append(Object.assign(document.createElement("h2"), { textContent: "Workspace & git" }));
  const grid = document.createElement("div");
  grid.className = "issue-meta-grid";
  grid.append(
    kv("Workspace", detail.workspacePath ?? detail.workspaceKey ?? "—"),
    kv("Branch", detail.branchName ?? "—"),
    kv("Pull request", detail.pullRequestUrl ?? "—"),
    kv("Tokens", formatCompactNumber(detail.tokenUsage?.totalTokens ?? null)),
    kv("Cost", formatCostUsd(computeIssueCostUsd(detail))),
    kv("Duration", formatDuration(computeDurationSeconds(detail.startedAt, detail.updatedAt))),
    kv("Last event", formatTimestamp(detail.lastEventAt ?? detail.updatedAt)),
  );
  const actions = document.createElement("div");
  actions.className = "mc-actions";
  actions.append(
    button("Copy workspace", async () => {
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
  section.append(Object.assign(document.createElement("h2"), { textContent: "Model settings" }));

  const active = document.createElement("div");
  active.className = "issue-summary-strip";
  active.append(kv("Active model", detail.model ?? "—"), kv("Reasoning", detail.reasoningEffort ?? "—"));

  const form = document.createElement("form");
  form.className = "issue-form-grid";
  const currentModel = detail.configuredModel ?? detail.model ?? "gpt-5.4";
  const modelSelect = createSelectControl({
    options: [{ value: currentModel, label: currentModel }],
    value: currentModel,
    required: true,
  });
  api.getModels().then(({ models }) => {
    const selected = modelSelect.value;
    modelSelect.replaceChildren();
    for (const { id, displayName } of models) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = displayName;
      opt.selected = id === selected;
      modelSelect.append(opt);
    }
  });
  const effortSelect = createSelectControl({
    options: REASONING_EFFORT_OPTIONS.map((value) => ({
      value: value === "none" ? "" : value,
      label: value,
    })),
    value: detail.configuredReasoningEffort ?? detail.reasoningEffort ?? "",
  });
  const save = createButton("Save", "ghost", "submit");
  form.append(
    createField({ label: "Model", hint: "Applied on the next attempt.", required: true }, modelSelect),
    createField({ label: "Reasoning effort", hint: "Leave blank to follow the active issue default." }, effortSelect),
    save,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api.postModelOverride(detail.identifier, {
        model: modelSelect.value || detail.model || "gpt-5.4",
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
  const footer = document.createElement("div");
  footer.className = "mc-actions";
  footer.append(note);
  if (detail.modelChangePending) {
    const cancelBtn = button("Cancel pending change", async () => {
      try {
        await api.postModelOverride(detail.identifier, {
          model: detail.model ?? "",
          reasoningEffort: detail.reasoningEffort ?? "",
        });
        toast("Pending model change cancelled.", "success");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Failed to cancel model change.", "error");
      }
    });
    footer.append(cancelBtn);
  }
  section.append(active, form, footer);
  return section;
}

export function buildActivitySection(detail: IssueDetail): HTMLElement {
  const section = document.createElement("section");
  section.className = "issue-section mc-panel expand-in";
  section.append(Object.assign(document.createElement("h2"), { textContent: "Activity" }));
  const list = document.createElement("div");
  list.className = "issue-activity-list";
  const events = detail.recentEvents.slice(-5);
  if (events.length === 0) {
    list.append(
      createEmptyState(
        "No recent activity",
        "This issue has not emitted any recent events yet. Live logs and archived attempts will appear here after the next worker update.",
        "Open logs",
        () => router.navigate(`/issues/${detail.identifier}/logs`),
      ),
    );
  } else {
    const rows = events.map((event) => createEventRow(event, true));
    applyStagger(rows);
    list.append(...rows);
  }
  const link = document.createElement("a");
  link.className = "mc-button is-ghost";
  link.href = `/issues/${detail.identifier}/logs`;
  link.textContent = "Open logs";
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
