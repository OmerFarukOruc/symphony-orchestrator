import { api } from "../api";
import { toast } from "../ui/toast";
import { parsePathValue, prettyJson } from "./config-helpers";
import type { ConfigState } from "./config-state";

export function createConfigActions(state: ConfigState, render: () => void, load: () => Promise<void>) {
  async function savePath(): Promise<void> {
    if (!state.selectedPath.trim()) {
      toast("Path is required.", "error");
      return;
    }
    state.saving = true;
    render();
    try {
      const response = await api.putConfigOverlay({
        path: state.selectedPath.trim(),
        value: parsePathValue(state.pathValue),
      });
      state.overlay = response.overlay;
      state.rawPatch = prettyJson(state.overlay);
      toast("Overlay path saved.", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to save path.", "error");
    } finally {
      state.saving = false;
      render();
    }
  }

  async function saveRaw(): Promise<void> {
    state.saving = true;
    render();
    try {
      const patch = JSON.parse(state.rawPatch) as Record<string, unknown>;
      const response = await api.putConfigOverlay({ patch });
      state.overlay = response.overlay;
      toast("Overlay patch saved.", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to save patch.", "error");
    } finally {
      state.saving = false;
      render();
    }
  }

  async function deletePath(path: string): Promise<void> {
    try {
      await api.deleteConfigOverlayPath(path);
      toast("Overlay path removed.", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to remove path.", "error");
    }
  }

  return { savePath, saveRaw, deletePath };
}
