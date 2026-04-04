// Dev-only annotation island — mounts the Agentation React component
// into a dedicated root so it doesn't interfere with the vanilla app.
import type { AgentationProps } from "agentation";

const AGENTATION_QUERY_PARAM = "agentation";
const ENABLED_AGENTATION_VALUES = new Set(["1", "true", "enabled", "on"]);

function queryEnablesAgentation(): boolean {
  try {
    const value = new URL(globalThis.location.href).searchParams.get(AGENTATION_QUERY_PARAM);
    return value !== null && ENABLED_AGENTATION_VALUES.has(value.trim().toLowerCase());
  } catch {
    return false;
  }
}

export function shouldMountAgentation(): boolean {
  if (typeof document === "undefined" || !document.body) {
    return false;
  }
  return document.body.dataset.agentation === "enabled" || queryEnablesAgentation();
}

async function mountAgentation(): Promise<void> {
  const [{ createElement }, { createRoot }, { Agentation }] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("agentation"),
  ]);

  const root = document.createElement("div");
  root.id = "agentation-root";
  document.body.appendChild(root);

  const endpoint = document.body.dataset.agentationEndpoint?.trim() || "http://localhost:4747";
  createRoot(root).render(createElement<AgentationProps>(Agentation, { endpoint }));
}

if (typeof document !== "undefined" && shouldMountAgentation()) {
  try {
    await mountAgentation();
  } catch (error) {
    console.error("Failed to mount Agentation", error);
  }
}
