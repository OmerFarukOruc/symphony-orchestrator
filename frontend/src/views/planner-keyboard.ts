interface PlannerKeyboardOptions {
  hasPlan: boolean;
  modalOpen: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGenerate: () => void;
  onOpenExecute: () => void;
  onCloseExecute: () => void;
}

export function handlePlannerKeyboard(event: KeyboardEvent, options: PlannerKeyboardOptions): boolean {
  if (
    event.target instanceof HTMLElement &&
    (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.tagName === "SELECT")
  ) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      options.onGenerate();
      return true;
    }
    return false;
  }
  if (event.key === "j" && options.hasPlan) {
    options.onNext();
    return true;
  }
  if (event.key === "k" && options.hasPlan) {
    options.onPrev();
    return true;
  }
  if (event.key === "Enter" && event.shiftKey && options.hasPlan) {
    event.preventDefault();
    options.onOpenExecute();
    return true;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    options.onGenerate();
    return true;
  }
  if (event.key === "Escape" && options.modalOpen) {
    options.onCloseExecute();
    return true;
  }
  return false;
}
