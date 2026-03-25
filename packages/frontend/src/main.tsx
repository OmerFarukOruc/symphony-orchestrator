import "../../../frontend/src/agentation-island";
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

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { App } from "./react-app";

const root = document.getElementById("app");
if (!root) {
  throw new Error("#app root not found");
}

root.classList.add("shell-app");

const queryClient = new QueryClient();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App queryClient={queryClient} />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
