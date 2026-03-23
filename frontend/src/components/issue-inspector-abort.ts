import { api } from "../api";
import type { IssueDetail } from "../types";
import { openConfirmModal } from "../ui/confirm-modal.js";
import { toast } from "../ui/toast";
import { createButton } from "./forms.js";

interface IssueAbortActionOptions {
  requestRefresh: () => Promise<void>;
}

export function createIssueAbortAction(options: IssueAbortActionOptions): {
  button: HTMLButtonElement;
  sync: (detail: IssueDetail | null) => void;
} {
  const button = createButton("Abort");
  let currentDetail: IssueDetail | null = null;
  let inFlight = false;

  function sync(detail: IssueDetail | null): void {
    currentDetail = detail;
    button.hidden = detail?.status !== "running";
    button.disabled = inFlight;
    button.textContent = inFlight ? "Aborting…" : "Abort";
  }

  button.addEventListener("click", () => {
    if (!currentDetail || currentDetail.status !== "running" || inFlight) {
      return;
    }

    const detail = currentDetail;
    const body = document.createElement("p");
    body.className = "text-secondary";
    body.textContent = `Abort the active worker for ${detail.identifier}? The issue will move to stopping and then cancelled after refresh.`;

    openConfirmModal({
      title: `Abort ${detail.identifier}?`,
      body,
      cancelLabel: "Keep running",
      confirmLabel: "Abort issue",
      pendingLabel: "Aborting…",
      variant: "danger",
      onConfirm: async () => {
        inFlight = true;
        sync(detail);
        try {
          const response = await api.postAbortIssue(detail.identifier);
          currentDetail = { ...detail, status: "stopping" };
          toast(
            response.already_stopping
              ? `Abort already requested for ${detail.identifier}.`
              : `Abort requested for ${detail.identifier}.`,
            "success",
          );
          void options.requestRefresh().catch((error) => {
            toast(
              error instanceof Error
                ? `Abort requested, but refresh failed: ${error.message}`
                : "Abort requested, but refresh failed.",
              "warning",
            );
          });
        } catch (error) {
          toast(error instanceof Error ? error.message : "Failed to abort issue.", "error");
          return false;
        } finally {
          inFlight = false;
          sync(currentDetail);
        }

        return true;
      },
    });
  });

  sync(null);
  return { button, sync };
}
