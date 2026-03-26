import "../../../frontend/src/styles/tokens.css";
import "../../../frontend/src/styles/polish-tokens.css";
import "../../../frontend/src/styles/animations.css";
import "../../../frontend/src/styles/polish-motion.css";
import "../../../frontend/src/styles/primitives.css";
import "../../../frontend/src/styles/shell.css";
import "../../../frontend/src/styles/shell-responsive.css";
import "../../../frontend/src/styles/polish-brand.css";
import "../../../frontend/src/styles/palette.css";
import "../../../frontend/src/styles/components.css";
import "../../../frontend/src/styles/diff.css";
import "../../../frontend/src/styles/forms.css";
import "../../../frontend/src/styles/modal.css";
import "../../../frontend/src/styles/hardening.css";
import "../../../frontend/src/styles/kanban.css";
import "../../../frontend/src/styles/container-queries.css";
import "../../../frontend/src/styles/git.css";
import "../../../frontend/src/styles/queue.css";
import "../../../frontend/src/styles/issue.css";
import "../../../frontend/src/styles/issue-inspector-rail.css";
import "../../../frontend/src/styles/queue-dnd.css";
import "../../../frontend/src/styles/runs.css";
import "../../../frontend/src/styles/logs.css";
import "../../../frontend/src/styles/attempt.css";
import "../../../frontend/src/styles/observability.css";
import "../../../frontend/src/styles/workspace.css";
import "../../../frontend/src/styles/welcome.css";
import "../../../frontend/src/styles/setup.css";
import "../../../frontend/src/styles/settings.css";
import "../../../frontend/src/styles/config.css";
import "../../../frontend/src/styles/secrets.css";
import "../../../frontend/src/styles/unified-settings.css";
import "./base.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { router as legacyRouter } from "../../../frontend/src/router.js";
import { initCommandPalette } from "../../../frontend/src/ui/command-palette.js";
import { initKeyboard } from "../../../frontend/src/ui/keyboard.js";

import { App } from "./App.js";
import { createQueryClient } from "./hooks/query-client.js";

const root = document.getElementById("app");
if (!root) {
  throw new Error("#app root not found");
}

const queryClient = createQueryClient();

initCommandPalette();
initKeyboard(legacyRouter);

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
