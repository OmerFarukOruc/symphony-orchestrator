# 🚀 Getting Started with Symphony

> **Time to first run: ~10 minutes**

Symphony watches your Linear project for issues, launches sandboxed AI agents to solve them, and delivers the results as GitHub pull requests — all running locally on your machine.

---

## Prerequisites

Before you begin, make sure you have:

| What | Why |
|------|-----|
| **Node.js 22+** | Runtime for Symphony |
| **Docker** (optional) | For sandboxed agent execution — required for production use |
| **Linear account** | Issue tracker that Symphony polls for work |
| **OpenAI API key** _or_ **Codex subscription** | Powers the AI agents |
| **GitHub PAT** _(optional)_ | Enables automatic branch creation and PRs |

---

## 1. Install & Build

```bash
git clone https://github.com/OmerFarukOruc/symphony-orchestrator.git
cd symphony-orchestrator
pnpm install && pnpm run build
```

If you plan to run agents in Docker containers (recommended for production):

```bash
bash bin/build-sandbox.sh
```

---

## 2. Set Environment Variables

Symphony needs at minimum your Linear API key and project slug:

```bash
export LINEAR_API_KEY="lin_api_..."
export LINEAR_PROJECT_SLUG="your-project-slug"
```

**Finding your project slug:** Open your Linear project in a browser. The URL looks like:

```
https://linear.app/<workspace>/project/<project-slug>/overview
```

Copy the `<project-slug>` part.

**For AI provider auth**, choose one:

```bash
# Option A: OpenAI API key
export OPENAI_API_KEY="sk-..."

# Option B: Codex subscription login
codex login
```

---

## 3. Start Symphony

**Development mode** (with auto-reload):

```bash
pnpm run dev -- ./WORKFLOW.example.md --port 4000
```

**Production mode** (from built output):

```bash
node dist/cli/index.js ./WORKFLOW.example.md --port 4000
```

**Docker mode** (zero-config):

```bash
docker compose up --build
```

---

## 4. Complete the Setup Wizard

Open **http://localhost:4000** in your browser. The setup wizard walks you through:

| Step | What to do | Required? |
|------|-----------|-----------|
| 🔐 **Protect secrets** | Auto-generates an encryption key — **copy it and save it somewhere safe** | Yes |
| 🗂️ **Connect Linear** | Paste your `LINEAR_API_KEY`, select a project | Yes |
| 🤖 **Add OpenAI** | Paste an API key, _or_ click **"Sign in with OpenAI"** to use your Codex subscription | Yes |
| 🐙 **Add GitHub** | Paste a GitHub Personal Access Token | No (skip for now) |

> **Tip:** If you already set `LINEAR_API_KEY` and `LINEAR_PROJECT_SLUG` as environment variables, the wizard auto-detects them.

### Navigation tips

- **Click any completed step** in the top stepper bar to go back and review or change it.
- If you return to **Protect secrets** after completing it, you'll see a confirmation that the key is configured, with a **Reconfigure** button if you need to regenerate it (this clears all stored secrets).
- If your Linear workspace has **no projects yet**, the wizard shows a message with a link to create one in Linear. After creating it, click **Re-verify** to load it.

---

## 5. Run Your First Issue

The fastest way to verify everything works:

1. **Create a Linear issue** with title: `SMOKE: create workspace proof file`
2. **Move it to "In Progress"** (or another active state)
3. **Watch the dashboard** — within ~30 seconds, Symphony picks it up

You'll see the issue appear under "Running" on the Overview page. The agent creates a `SYMPHONY_SMOKE_RESULT.md` file in the workspace and finishes.

Alternatively, use the **"Create Test Issue"** button on the setup completion page — it creates and moves a smoke issue automatically.

---

## 6. Dashboard Tour

| Tab | What it shows |
|-----|---------------|
| **Overview** | Live metrics, attention queue, recent events, system health |
| **Board** | Kanban view of all issues across workflow states |
| **Settings** | Tracker connection, model provider, sandbox config, credentials |
| **Observability** | System health, Prometheus metrics, anomaly detection |
| **Git** | Configured repos, active branches, recent PRs |
| **Workspaces** | Disk usage and lifecycle of per-issue workspaces |
| **Welcome** | Quick-start guide and version info |
| **Setup** | Re-run the credential wizard at any time |

---

## Common Pitfalls

### "Missing tracker project slug" error

```
error code=missing_tracker_project_slug
```

**Fix:** Make sure `LINEAR_PROJECT_SLUG` is exported in your terminal _before_ starting Symphony.

### Issue not being picked up

- Check that the issue is in an **active state** (default: `Backlog`, `Todo`, or `In Progress`)
- The default polling interval is 30 seconds — wait at least one cycle
- Click **Refresh** (🔄) on the dashboard to trigger an immediate poll

### Agent fails immediately

```
error code=startup_failed
```

**Fix:** Verify your OpenAI API key or Codex auth is valid. For API key mode, test with:

```bash
curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
```

---

## Next Steps

| Want to... | Go to... |
|-----------|----------|
| Configure sandbox, retries, timeouts | [Operator Guide](OPERATOR_GUIDE.md) |
| Set up Slack notifications | [Operator Guide → Notifications](OPERATOR_GUIDE.md#-notifications-and-git-automation) |
| Understand the trust model | [Trust & Auth](TRUST_AND_AUTH.md) |
| See the full feature roadmap | [Roadmap](ROADMAP_AND_STATUS.md) |
| Troubleshoot failures | [Runbooks](RUNBOOKS.md) |
| Monitor with Prometheus | [Observability](OBSERVABILITY.md) |
| Use the JSON API | [Operator Guide → API Reference](OPERATOR_GUIDE.md#-json-api-reference) |
