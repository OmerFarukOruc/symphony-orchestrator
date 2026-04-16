import { createTableCell, createTableEmptyRow, createTableHead } from "../../ui/table.js";
import { toast } from "../../ui/toast.js";
import type { CodexMcpServerStatusEntry } from "../../types/codex.js";
import { reloadCodexMcp, startCodexMcpOauthLogin } from "./codex-admin-client.js";
import { createPanel, formatErrorMessage, runCodexAdminAction } from "./codex-admin-helpers.js";

export function renderMcpPanel(servers: CodexMcpServerStatusEntry[], onRefresh: () => Promise<void>): HTMLElement {
  const reloadButton = document.createElement("button");
  reloadButton.type = "button";
  reloadButton.className = "mc-button is-ghost";
  reloadButton.textContent = "Reload MCP";
  reloadButton.addEventListener("click", () => {
    void runCodexAdminAction(
      () => reloadCodexMcp(),
      "MCP reload requested.",
      "Failed to reload MCP configuration.",
      onRefresh,
    );
  });
  const panel = createPanel(
    "MCP servers",
    "Configured MCP status, authentication state, and visible tool/resource counts.",
    [reloadButton],
  );
  const tableWrap = document.createElement("div");
  tableWrap.className = "codex-admin-table-wrap";
  const table = document.createElement("table");
  table.className = "attempts-table codex-admin-table";
  table.append(createTableHead(["Server", "Status", "Auth", "Inventory", "Actions"]));
  const body = document.createElement("tbody");

  if (servers.length === 0) {
    body.append(createTableEmptyRow("No MCP servers returned by the control plane.", 5));
  } else {
    for (const server of servers) {
      body.append(createMcpServerRow(server));
    }
  }

  table.append(body);
  tableWrap.append(table);
  panel.append(tableWrap);
  return panel;
}

function createMcpServerRow(server: CodexMcpServerStatusEntry): HTMLTableRowElement {
  const row = document.createElement("tr");
  const actions = document.createElement("td");
  actions.className = "codex-admin-actions";
  actions.append(buildOauthButton(server.name));
  row.append(
    createTableCell(server.name),
    createTableCell(server.status || "\u2014"),
    createTableCell(server.authStatus || "\u2014"),
    createTableCell(`${server.tools?.length ?? 0} tools \u2022 ${server.resources?.length ?? 0} resources`),
    actions,
  );
  return row;
}

function buildOauthButton(serverName: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mc-button is-ghost";
  button.textContent = "OAuth login";
  button.addEventListener("click", () => {
    void (async () => {
      try {
        const result = await startCodexMcpOauthLogin(serverName);
        const raw = typeof result === "object" && result !== null ? result : {};
        const authUrl =
          (typeof raw.authUrl === "string" ? raw.authUrl : undefined) ||
          (typeof raw.authorizationUrl === "string" ? raw.authorizationUrl : undefined);
        if (authUrl) {
          globalThis.open?.(authUrl, "_blank", "noopener");
          toast(`Opened OAuth login for ${serverName}.`, "success");
        } else {
          toast(`OAuth login started for ${serverName}.`, "info");
        }
      } catch (error) {
        toast(formatErrorMessage(error, `Failed to start OAuth login for ${serverName}.`), "error");
      }
    })();
  });
  return button;
}
