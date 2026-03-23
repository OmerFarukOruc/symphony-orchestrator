export function createWelcomePage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "welcome-page fade-in";

  const hero = document.createElement("section");
  hero.className = "welcome-hero";
  hero.innerHTML = `
    <h1 class="welcome-hero-title">Symphony</h1>
    <p class="welcome-hero-subtitle">Your AI coding assistant for Linear.</p>
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
      title: "Choose your project",
      desc: "Tell Symphony which Linear project to watch and how to handle issues.",
      link: "View example",
    },
    {
      n: "2",
      title: "Add your credentials",
      desc: "Add your Linear API key and AI provider keys in Credentials.",
      link: "Open Credentials",
    },
    {
      n: "3",
      title: "Review settings",
      desc: "Adjust sandbox mode, polling interval, and agent limits.",
      link: "Open Settings",
    },
    {
      n: "4",
      title: "Start Symphony",
      desc: "Run Symphony from your terminal and watch it process issues.",
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
          "View example": "/config",
          "Open Credentials": "/secrets",
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
  codeBlock.textContent = "node dist/cli/index.js ./WORKFLOW.example.md --port 4000";
  checklist.append(codeBlock);

  const footer = document.createElement("p");
  footer.className = "welcome-footer";
  footer.textContent = "This page appears when no workflow is active. Run Symphony from the terminal to start.";

  page.append(hero, checklist, footer);
  return page;
}
