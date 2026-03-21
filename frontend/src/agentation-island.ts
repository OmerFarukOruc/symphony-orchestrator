// Dev-only annotation island — mounts the Agentation React component
// into a dedicated root so it doesn't interfere with the vanilla app.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Agentation } from "agentation";

const root = document.createElement("div");
root.id = "agentation-root";
document.body.appendChild(root);
createRoot(root).render(createElement(Agentation, { endpoint: "http://localhost:4747" }));
