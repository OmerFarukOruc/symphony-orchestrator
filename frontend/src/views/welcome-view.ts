export function createWelcomePage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "welcome-page fade-in";

  const hero = document.createElement("section");
  hero.className = "welcome-hero";
  hero.innerHTML = `
    <h1 class="welcome-hero-title">Symphony</h1>
    <p class="welcome-hero-subtitle">Autonomous issue orchestration.</p>
    <p class="welcome-hero-version">v0.2.0</p>
  `;

  const checklist = document.createElement("section");
  checklist.className = "welcome-checklist";

  const checklistTitle = document.createElement("h2");
  checklistTitle.className = "section-title";
  checklistTitle.textContent = "Get started";
  checklist.append(checklistTitle);

  const steps = [
    {
      n: "1",
      title: "Create a workflow file",
      desc: "Define your issue sources, agent config, and orchestration rules in a YAML file.",
      link: "View example",
    },
    {
      n: "2",
      title: "Set up credentials",
      desc: "Add your Linear API key and AI provider keys.",
      link: "Open Secrets",
    },
    {
      n: "3",
      title: "Configure your environment",
      desc: "Set sandbox mode, polling interval, and agent limits.",
      link: "Open Settings",
    },
    {
      n: "4",
      title: "Start orchestrating",
      desc: "Run Symphony with your workflow file and watch it process issues.",
      link: null,
    },
  ];

  const list = document.createElement("div");
  list.className = "welcome-steps";

  for (const step of steps) {
    const row = document.createElement("div");
    row.className = "welcome-step";

    const num = document.createElement("div");
    num.className = "welcome-step-number";
    num.textContent = step.n;

    const content = document.createElement("div");
    content.className = "welcome-step-content";

    const titleEl = document.createElement("div");
    titleEl.className = "welcome-step-title";
    titleEl.textContent = step.title;

    const descEl = document.createElement("div");
    descEl.className = "welcome-step-desc";
    descEl.textContent = step.desc;

    content.append(titleEl, descEl);

    if (step.link) {
      const linkEl = document.createElement("a");
      linkEl.href = "#";
      linkEl.className = "welcome-step-link";
      linkEl.textContent = `${step.link} \u2192`;
      linkEl.addEventListener("click", (e) => {
        e.preventDefault();
        const paths: Record<string, string> = {
          "View example": "/planner",
          "Open Secrets": "/secrets",
          "Open Settings": "/settings",
        };
        if (paths[step.link!]) {
          window.history.pushState({}, "", paths[step.link!]);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      });
      content.append(linkEl);
    }

    row.append(num, content);
    list.append(row);
  }
  checklist.append(list);

  const codeBlock = document.createElement("pre");
  codeBlock.className = "welcome-code-block mc-code-panel";
  codeBlock.textContent = "node dist/cli.js ./WORKFLOW.example.md --port 4000";
  checklist.append(codeBlock);

  const footer = document.createElement("p");
  footer.className = "welcome-footer";
  footer.textContent =
    "This page appears when no active workflow is detected. Start a workflow to see Mission Control.";

  page.append(hero, checklist, footer);
  return page;
}
