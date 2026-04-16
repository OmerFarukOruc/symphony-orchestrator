import { createEmptyState } from "../../components/empty-state.js";
import type { CodexUserInputRequest } from "../../types/codex.js";
import { answerCodexUserInputRequest } from "./codex-admin-client.js";
import { createPanel, promptForUserInput, runCodexAdminAction } from "./codex-admin-helpers.js";

export function renderPendingRequestsPanel(
  requests: CodexUserInputRequest[],
  onRefresh: () => Promise<void>,
): HTMLElement {
  const panel = createPanel("Pending prompts", "Interactive app-server questions currently waiting on operator input.");
  if (requests.length === 0) {
    panel.append(createEmptyState("No prompts waiting", "When Codex asks for input, the queue will appear here."));
    return panel;
  }

  const list = document.createElement("div");
  list.className = "codex-admin-request-list";
  for (const request of requests) {
    list.append(createRequestItem(request, onRefresh));
  }
  panel.append(list);
  return panel;
}

function createRequestItem(request: CodexUserInputRequest, onRefresh: () => Promise<void>): HTMLElement {
  const item = document.createElement("div");
  item.className = "codex-admin-request";
  const title = document.createElement("strong");
  title.textContent = request.threadId ? `${request.method} \u2022 ${request.threadId}` : request.method;
  const meta = document.createElement("p");
  meta.className = "text-secondary";
  meta.textContent = `${request.questions.length} question(s) \u2022 ${new Date(request.createdAt).toLocaleString()}`;
  const answerButton = document.createElement("button");
  answerButton.type = "button";
  answerButton.className = "mc-button is-ghost";
  answerButton.textContent = "Answer";
  answerButton.addEventListener("click", () => {
    void (async () => {
      const result = await promptForUserInput(request);
      if (result === null) return;
      await runCodexAdminAction(
        () => answerCodexUserInputRequest(request.requestId, result),
        "Prompt response sent.",
        "Failed to send prompt response.",
        onRefresh,
      );
    })();
  });
  item.append(title, meta, answerButton);
  return item;
}
