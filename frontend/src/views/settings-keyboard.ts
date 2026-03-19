interface SettingsKeyboardOptions {
  onFocusSearch: () => void;
  onSaveCurrentSection: () => void;
}

export function handleSettingsKeyboard(event: KeyboardEvent, options: SettingsKeyboardOptions): boolean {
  const isTyping =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable);
  if (event.key === "/" && !isTyping) {
    event.preventDefault();
    options.onFocusSearch();
    return true;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    options.onSaveCurrentSection();
    return true;
  }
  return false;
}
