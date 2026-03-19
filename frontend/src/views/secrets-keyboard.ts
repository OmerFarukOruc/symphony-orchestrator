interface SecretsKeyboardOptions {
  selectedKey: string;
  addOpen: boolean;
  deleteOpen: boolean;
  isTyping: boolean;
  onNew: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function handleSecretsKeyboard(event: KeyboardEvent, options: SecretsKeyboardOptions): boolean {
  if (event.key.toLowerCase() === "n" && !options.isTyping) {
    event.preventDefault();
    options.onNew();
    return true;
  }
  if (event.key === "Delete" && options.selectedKey && !options.isTyping && !options.deleteOpen) {
    event.preventDefault();
    options.onDelete();
    return true;
  }
  if (event.key === "Escape" && (options.addOpen || options.deleteOpen)) {
    options.onClose();
    return true;
  }
  return false;
}
