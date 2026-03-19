interface ObservabilityKeyboardOptions {
  onRefresh: () => void;
  onToggleRawDrawer: () => void;
}

export function handleObservabilityKeyboard(event: KeyboardEvent, options: ObservabilityKeyboardOptions): boolean {
  const isTyping =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable);
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    return false;
  }
  if (!isTyping && event.key.toLowerCase() === "r") {
    event.preventDefault();
    options.onRefresh();
    return true;
  }
  if (!isTyping && event.key.toLowerCase() === "x") {
    event.preventDefault();
    options.onToggleRawDrawer();
    return true;
  }
  return false;
}
