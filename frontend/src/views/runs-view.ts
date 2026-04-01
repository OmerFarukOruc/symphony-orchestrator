import { api } from "../api.js";
import { createEmptyState } from "../components/empty-state.js";
import { createPageHeader } from "../components/page-header.js";
import { router } from "../router.js";
import { toast } from "../ui/toast.js";
import { skeletonBlock } from "../ui/skeleton.js";
import { isTypingTarget } from "../utils/dom.js";
import { registerPageCleanup } from "../utils/page.js";

import {
  activeAttempt,
  activeAttemptDetail,
  clearComparedAttempts,
  comparedAttempts,
  createRunsState,
  moveActiveAttempt,
  setActiveAttempt,
  setAttemptDetail,
  setRunsData,
  setRunsError,
  shouldLoadActiveDetail,
  toggleCompareAttempt,
} from "./runs-state.js";
import { renderRunsLoadingPanel, renderRunsSummary } from "./runs-detail.js";
import { createRunsCompare } from "./runs-compare.js";
import { createRunsTable } from "./runs-table.js";

export function createRunsPage(issueId: string): HTMLElement {
  const state = createRunsState(issueId);
  const page = document.createElement("div");
  page.className = "page runs-page fade-in";
  const actions = document.createElement("div");
  actions.className = "mc-actions";
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "mc-button is-ghost";
  backButton.textContent = "Back to issue";
  backButton.addEventListener("click", () => router.navigate(`/issues/${state.issueIdentifier}`));
  actions.append(backButton);
  const header = createPageHeader(
    "Run History",
    "Inspect archived runs, compare two attempts, and jump into detailed attempt metadata.",
    { actions },
  );
  const titleElement = header.querySelector(".page-title");
  const subtitleElement = header.querySelector(".page-subtitle");
  if (!(titleElement instanceof HTMLElement) || !(subtitleElement instanceof HTMLElement)) {
    throw new TypeError("Runs page header is missing required elements.");
  }
  const title = titleElement;
  const subtitle = subtitleElement;

  const layout = document.createElement("section");
  layout.className = "runs-layout";
  const tableColumn = document.createElement("div");
  tableColumn.className = "runs-column";
  const detailColumn = document.createElement("aside");
  detailColumn.className = "runs-column runs-detail-column";
  layout.append(tableColumn, detailColumn);
  page.append(header, layout);

  async function loadDetail(attemptId: string): Promise<void> {
    if (state.details.has(attemptId) || state.detailLoadingId === attemptId) {
      return;
    }
    state.detailLoadingId = attemptId;
    render();
    try {
      setAttemptDetail(state, await api.getAttemptDetail(attemptId));
    } catch (error) {
      state.detailLoadingId = null;
      toast(error instanceof Error ? error.message : "Failed to load attempt detail.", "error");
    }
    render();
  }

  /** True when the API returned a real identifier (not just the raw URL slug). */
  function hasResolvedIdentifier(): boolean {
    return state.issueIdentifier !== issueId || state.issueTitle !== issueId;
  }

  function render(): void {
    if (state.loading) {
      title.textContent = "Run History";
      subtitle.textContent = "Loading\u2026";
      tableColumn.replaceChildren(skeletonBlock("320px"));
      detailColumn.replaceChildren(renderRunsLoadingPanel());
      return;
    }
    if (state.error) {
      // When the issue was never resolved, show a generic heading
      // instead of the raw URL slug (BUG-06).
      title.textContent = hasResolvedIdentifier() ? `${state.issueIdentifier} Run History` : "Run History";
      subtitle.textContent = hasResolvedIdentifier() ? state.issueTitle : "";
      backButton.textContent = hasResolvedIdentifier() ? `Back to ${state.issueIdentifier}` : "Back to board";
      const backTarget = hasResolvedIdentifier() ? `/issues/${state.issueIdentifier}` : "/queue";
      tableColumn.replaceChildren(
        createEmptyState("Run history unavailable", state.error, backButton.textContent, () =>
          router.navigate(backTarget),
        ),
      );
      detailColumn.replaceChildren(
        createEmptyState("No run selected", "Resolve the error on the left, then try again.", "Open board", () =>
          router.navigate("/queue"),
        ),
      );
      return;
    }

    title.textContent = `${state.issueIdentifier} Run History`;
    subtitle.textContent = state.issueTitle;
    backButton.textContent = `Back to ${state.issueIdentifier}`;
    if (state.attempts.length === 0) {
      tableColumn.replaceChildren(
        createEmptyState(
          "No archived runs yet",
          "Run summaries appear here after an attempt finishes. Check live logs to follow work in progress.",
          "View live logs",
          () => router.navigate(`/issues/${state.issueIdentifier}/logs`),
        ),
      );
      detailColumn.replaceChildren(
        createEmptyState(
          "No run selected",
          "Run detail will appear here once the first attempt completes.",
          "Back to issue",
          () => router.navigate(`/issues/${state.issueIdentifier}`),
        ),
      );
      return;
    }
    tableColumn.replaceChildren(
      createRunsTable({
        attempts: state.attempts,
        activeAttemptId: state.activeAttemptId,
        compareAttemptIds: state.compareAttemptIds,
        onSelect: (attemptId) => {
          setActiveAttempt(state, attemptId);
          if (shouldLoadActiveDetail(state)) {
            void loadDetail(attemptId);
          }
          render();
        },
        onToggleCompare: (attemptId) => {
          if (!toggleCompareAttempt(state, attemptId)) {
            toast("Compare mode is limited to two runs.", "info");
          }
          render();
        },
      }),
    );

    const selected = comparedAttempts(state);
    if (selected.length === 2) {
      detailColumn.replaceChildren(
        createRunsCompare(selected[0], selected[1], () => {
          clearComparedAttempts(state);
          render();
        }),
      );
      return;
    }
    const attempt = activeAttempt(state);
    if (!attempt) {
      detailColumn.replaceChildren(
        createEmptyState("No run selected", "Pick a run from the list to see its summary here.", "Back to issue", () =>
          router.navigate(`/issues/${state.issueIdentifier}`),
        ),
      );
      return;
    }
    if (state.detailLoadingId === attempt.attemptId && !activeAttemptDetail(state)) {
      detailColumn.replaceChildren(renderRunsLoadingPanel());
      return;
    }
    detailColumn.replaceChildren(renderRunsSummary(attempt, activeAttemptDetail(state)));
  }

  async function load(): Promise<void> {
    try {
      const [attemptsResponse, issueDetail] = await Promise.all([
        api.getAttempts(issueId),
        api.getIssue(issueId).catch(() => null),
      ]);
      setRunsData(state, {
        issueIdentifier: issueDetail?.identifier ?? issueId,
        issueTitle: issueDetail?.title ?? issueId,
        issueStatus: issueDetail?.status ?? null,
        currentAttemptId: attemptsResponse.current_attempt_id,
        attempts: attemptsResponse.attempts,
      });
      render();
      if (shouldLoadActiveDetail(state) && state.activeAttemptId) {
        void loadDetail(state.activeAttemptId);
      }
    } catch (error) {
      setRunsError(state, error instanceof Error ? error.message : "Failed to load run history.");
      render();
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (isTypingTarget(event.target) || window.location.pathname !== `/issues/${state.issueIdentifier}/runs`) {
      return;
    }
    if (event.key === "j" || event.key === "k") {
      event.preventDefault();
      const next = moveActiveAttempt(state, event.key === "j" ? 1 : -1);
      if (next && shouldLoadActiveDetail(state)) {
        void loadDetail(next.attemptId);
      }
      render();
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      if (state.activeAttemptId && !toggleCompareAttempt(state, state.activeAttemptId)) {
        toast("Compare mode is limited to two runs.", "info");
      }
      render();
      return;
    }
    if (event.key === "Enter" && state.activeAttemptId) {
      event.preventDefault();
      router.navigate(`/attempts/${state.activeAttemptId}`);
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      router.navigate(`/issues/${state.issueIdentifier}`);
      return;
    }
    if (event.key === "Escape") {
      clearComparedAttempts(state);
      render();
    }
  }

  window.addEventListener("keydown", onKey);
  render();
  void load();
  registerPageCleanup(page, () => window.removeEventListener("keydown", onKey));
  return page;
}
