import { dashboardStyles } from "./template/styles.js";
import { dashboardHtml } from "./template/html.js";
import { dashboardScript } from "./template/script.js";

/**
 * Full dashboard page — assembles styles, HTML layout, and client-side script.
 */
export function renderDashboardTemplate(): string {
  return `<!DOCTYPE html>
<html class="light" lang="en">
<head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <title>Symphony | AI Agent Orchestration</title>
  <style>${dashboardStyles()}</style>
</head>
<body class="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 antialiased overflow-hidden h-screen flex">
  ${dashboardHtml()}
  <script>${dashboardScript()}</script>
</body>
</html>`;
}
