export function buildWelcomePage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "welcome-page page-enter";

  page.innerHTML = `
    <div class="welcome-hero">
      <h1 class="welcome-brand">Symphony</h1>
      <p class="welcome-tagline">Autonomous issue orchestration.</p>
      <span class="welcome-version">v${document.querySelector("meta[name=version]")?.getAttribute("content") ?? "0.2.0"}</span>
    </div>
    <section class="welcome-checklist">
      <h2>Get started</h2>
      <div class="welcome-step">
        <div class="welcome-step-indicator is-current">1</div>
        <div>
          <h3>Create a workflow file</h3>
          <p>Define your issue sources, agent config, and orchestration rules in a YAML file.</p>
          <a href="https://github.com/OmerFarukOruc/symphony-orchestrator#workflow-file" target="_blank">View example →</a>
        </div>
      </div>
      <div class="welcome-step">
        <div class="welcome-step-indicator">2</div>
        <div>
          <h3>Set up credentials</h3>
          <p>Add your Linear API key and AI provider keys.</p>
          <a href="/secrets">Open Secrets →</a>
        </div>
      </div>
      <div class="welcome-step">
        <div class="welcome-step-indicator">3</div>
        <div>
          <h3>Configure your environment</h3>
          <p>Set sandbox mode, polling interval, and agent limits.</p>
          <a href="/settings">Open Settings →</a>
        </div>
      </div>
      <div class="welcome-step">
        <div class="welcome-step-indicator">4</div>
        <div>
          <h3>Start orchestrating</h3>
          <p>Run Symphony with your workflow file and watch it process issues.</p>
          <div class="welcome-code">symphony ./workflow.yaml --port 4000</div>
        </div>
      </div>
    </section>
    <section>
      <h2 style="font-size:16px;font-weight:600;margin-bottom:var(--space-3)">Resources</h2>
      <div class="welcome-resources">
        <a class="welcome-resource-card" href="https://github.com/OmerFarukOruc/symphony-orchestrator" target="_blank">
          <h3>Documentation →</h3>
          <p>Full README and setup guide.</p>
        </a>
        <a class="welcome-resource-card" href="https://github.com/OmerFarukOruc/symphony-orchestrator/blob/main/docs/OPERATOR_GUIDE.md" target="_blank">
          <h3>Operator Guide →</h3>
          <p>Runtime behavior and operations.</p>
        </a>
        <a class="welcome-resource-card" href="https://github.com/OmerFarukOruc/symphony-orchestrator/blob/main/WORKFLOW.example.md" target="_blank">
          <h3>Example Workflows →</h3>
          <p>Sample YAML configurations.</p>
        </a>
      </div>
    </section>
    <p class="welcome-note">This page appears when no active workflow is detected. Start a workflow to see Mission Control.</p>
  `;

  return page;
}
