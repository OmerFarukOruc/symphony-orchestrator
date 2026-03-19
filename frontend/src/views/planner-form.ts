import { createButton, createField } from "../components/forms";

export interface PlannerFormControls {
  form: HTMLFormElement;
  goalInput: HTMLTextAreaElement;
  maxIssuesInput: HTMLInputElement;
  labelsInput: HTMLInputElement;
  generateButton: HTMLButtonElement;
  regenerateButton: HTMLButtonElement;
  executeButton: HTMLButtonElement;
  status: HTMLParagraphElement;
}

export function createPlannerForm(actions: {
  onGenerate: () => void;
  onRegenerate: () => void;
  onExecute: () => void;
}): PlannerFormControls {
  const goalInput = Object.assign(document.createElement("textarea"), {
    className: "mc-textarea planner-goal",
    placeholder:
      "Example: Break Phase 3 into three deployable Linear issues with dependencies and acceptance criteria.",
  });
  const maxIssuesInput = Object.assign(document.createElement("input"), {
    className: "mc-input",
    type: "number",
    min: "1",
    max: "20",
    placeholder: "5",
  });
  const labelsInput = Object.assign(document.createElement("input"), {
    className: "mc-input",
    placeholder: "frontend, redesign, hidden-features",
  });
  const generateButton = createButton("Generate plan", "primary", "submit");
  const regenerateButton = createButton("Regenerate", "ghost");
  const executeButton = createButton("Execute reviewed plan", "primary");
  const status = document.createElement("p");
  status.className = "page-subtitle";

  const form = document.createElement("form");
  form.className = "mc-panel form-grid";
  const header = document.createElement("div");
  header.className = "planner-header";
  header.innerHTML = `<div><h1 class="page-title">Planner</h1><p class="page-subtitle">Turn a deployment goal into editable, dependency-aware issue cards before Linear sees them.</p></div>`;

  const fields = document.createElement("div");
  fields.className = "form-grid columns-2";
  fields.append(
    createField(
      { label: "Goal", hint: "Describe the outcome, constraints, and hidden edges you want broken into work." },
      goalInput,
    ),
  );
  const sideFields = document.createElement("div");
  sideFields.className = "form-grid";
  sideFields.append(
    createField({ label: "Max issues", hint: "Optional cap, clamped to 20 by the API." }, maxIssuesInput),
    createField({ label: "Labels", hint: "Comma-separated labels applied to every generated issue." }, labelsInput),
  );
  fields.append(sideFields);

  const buttons = document.createElement("div");
  buttons.className = "form-actions";
  buttons.append(generateButton, regenerateButton, executeButton);
  form.append(header, fields, status, buttons);

  regenerateButton.addEventListener("click", actions.onRegenerate);
  executeButton.addEventListener("click", actions.onExecute);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    actions.onGenerate();
  });

  return { form, goalInput, maxIssuesInput, labelsInput, generateButton, regenerateButton, executeButton, status };
}
