import { logsStyles } from "./logs/styles.js";
import { logsHtml } from "./logs/html.js";
import { logsScript } from "./logs/script.js";

/**
 * Full logs page — assembles styles, HTML layout, and client-side script.
 */
export function renderLogsTemplate(issueIdentifier: string): string {
  const escaped = issueIdentifier.replaceAll(/[&<>"']/g, "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <title>Logs — ${escaped} | Symphony</title>
  <style>${logsStyles()}</style>
</head>
<body>
  ${logsHtml(escaped)}
  <script>${logsScript(escaped)}</script>
</body>
</html>`;
}
