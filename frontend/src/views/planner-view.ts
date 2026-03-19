import { api } from "../api";
import { createButton } from "../components/forms";
import { createModal } from "../components/modal";
import { toast } from "../ui/toast";
import { registerPageCleanup } from "../utils/page";
import { renderPlannerContent } from "./planner-content";
import { createPlannerForm } from "./planner-form";
import { buildCreatedLinks, parseLabels } from "./planner-helpers";
import { handlePlannerKeyboard } from "./planner-keyboard";
import { createPlannerState } from "./planner-state";

export function createPlannerPage(): HTMLElement {
  const state = createPlannerState();
  const page = document.createElement("div");
  page.className = "page planner-page fade-in";
  let selectedIndex = 0;
  let generating = false;

  const shell = document.createElement("section");
  shell.className = "planner-shell";
  const main = document.createElement("div");
  main.className = "planner-main";
  const rail = document.createElement("aside");
  rail.className = "planner-rail mc-panel";
  const modal = createModal({
    title: "Execute plan",
    description: "Linear issues will be created in the reviewed order.",
  });
  page.append(shell, modal.root);
  shell.append(main, rail);
  const controls = createPlannerForm({
    onGenerate: () => void generatePlan(),
    onRegenerate: () => void generatePlan(),
    onExecute: () => openExecuteModal(),
  });
  const { form, goalInput, maxIssuesInput, labelsInput, generateButton, regenerateButton, executeButton, status } =
    controls;

  function renderMain(): void {
    status.textContent =
      state.error ??
      (state.step === "input"
        ? "Hint: list constraints or sub-goals on separate lines for a more useful plan."
        : "Edit cards freely before execution. Shift+Enter opens execution on the selected card.");
    status.className = state.error ? "form-error" : "page-subtitle";
    goalInput.value = state.goal;
    maxIssuesInput.value = state.maxIssues ? String(state.maxIssues) : "";
    labelsInput.value = state.labels.join(", ");
    regenerateButton.disabled = generating;
    regenerateButton.hidden = !state.plan?.length;
    executeButton.disabled = !state.plan?.length || state.executing || generating;
    generateButton.disabled = generating;
    renderPlannerContent({
      main,
      rail,
      state,
      form,
      generating,
      selectedIndex,
      onSelectIndex: (index) => {
        selectedIndex = index;
      },
      onRender: renderMain,
    });
  }

  async function generatePlan(): Promise<void> {
    const goal = goalInput.value.trim();
    state.goal = goal;
    state.maxIssues = maxIssuesInput.value ? Number(maxIssuesInput.value) : undefined;
    state.labels = parseLabels(labelsInput.value);
    state.error = null;
    if (!goal) {
      state.error = "Goal is required.";
      renderMain();
      return;
    }
    generating = true;
    renderMain();
    try {
      const response = await api.postPlan({ goal, maxIssues: state.maxIssues, labels: state.labels });
      state.plan = response.issues;
      state.step = response.issues.length > 0 ? "review" : "input";
      state.result = null;
      selectedIndex = 0;
      toast("Plan generated.", "success");
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Failed to generate plan.";
    } finally {
      generating = false;
      renderMain();
    }
  }

  function openExecuteModal(): void {
    if (!state.plan?.length) {
      return;
    }
    modal.body.replaceChildren();
    modal.footer.replaceChildren();
    const summary = document.createElement("div");
    summary.className = "form-grid";
    const summaryP = document.createElement("p");
    summaryP.className = "text-secondary";
    summaryP.textContent = `You are about to create ${state.plan.length} Linear issues with labels ${state.labels.join(", ") || "none"}.`;
    summary.append(summaryP);
    const strip = document.createElement("div");
    strip.className = "planner-dependency-strip";
    state.plan.forEach((issue) => {
      const chip = document.createElement("span");
      chip.className = "planner-dependency-chip static";
      chip.textContent = issue.dependencies.length
        ? `${issue.id} depends on ${issue.dependencies.join(", ")}`
        : `${issue.id} starts chain`;
      strip.append(chip);
    });
    summary.append(strip);
    modal.body.append(summary);
    const cancel = createButton("Cancel");
    const confirm = createButton(state.executing ? "Executing…" : "Create issues", "primary");
    confirm.disabled = state.executing;
    cancel.addEventListener("click", () => modal.close());
    confirm.addEventListener("click", () => void executePlan());
    modal.footer.append(cancel, confirm);
    modal.open();
  }

  async function executePlan(): Promise<void> {
    if (!state.plan?.length || state.executing) {
      return;
    }
    state.executing = true;
    state.error = null;
    openExecuteModal();
    renderMain();
    try {
      const response = await api.postPlanExecute(state.plan);
      state.result = { created: buildCreatedLinks(response.external_ids) };
      state.step = "result";
      toast(`Created ${response.created} Linear issues.`, "success");
      modal.close();
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Failed to execute plan.";
      toast(state.error, "error");
    } finally {
      state.executing = false;
      renderMain();
    }
  }

  function onKey(event: KeyboardEvent): void {
    const handled = handlePlannerKeyboard(event, {
      hasPlan: Boolean(state.plan?.length),
      modalOpen: modal.isOpen(),
      onPrev: () => {
        selectedIndex = Math.max(0, selectedIndex - 1);
        renderMain();
      },
      onNext: () => {
        selectedIndex = Math.min((state.plan?.length ?? 1) - 1, selectedIndex + 1);
        renderMain();
      },
      onGenerate: () => void generatePlan(),
      onOpenExecute: () => openExecuteModal(),
      onCloseExecute: () => modal.close(),
    });
    if (handled) {
      return;
    }
  }

  window.addEventListener("keydown", onKey);
  renderMain();
  registerPageCleanup(page, () => {
    modal.destroy();
    window.removeEventListener("keydown", onKey);
  });
  return page;
}
