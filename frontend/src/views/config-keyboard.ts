interface ConfigKeyboardOptions {
  selectedPath: string;
  modalOpen: boolean;
  onFocusFilter: () => void;
  onNewOverride: () => void;
  onDelete: (path: string) => void;
  onSave: () => void;
  onCloseModal: () => void;
}

export function handleConfigKeyboard(event: KeyboardEvent, options: ConfigKeyboardOptions): boolean {
  const isTyping = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if (event.key === "/" && !isTyping) {
    event.preventDefault();
    options.onFocusFilter();
    return true;
  }
  if (event.key.toLowerCase() === "n" && !isTyping) {
    event.preventDefault();
    options.onNewOverride();
    return true;
  }
  if (event.key === "Delete" && options.selectedPath && !options.modalOpen) {
    event.preventDefault();
    options.onDelete(options.selectedPath);
    return true;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    options.onSave();
    return true;
  }
  if (event.key === "Escape" && options.modalOpen) {
    options.onCloseModal();
    return true;
  }
  return false;
}
