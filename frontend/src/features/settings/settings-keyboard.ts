import { createKeyboardCommandMap } from "../../ui/keyboard-commands.js";

interface SettingsKeyboardOptions {
  onFocusSearch: () => void;
  onSaveCurrentSection: () => void;
}

export function createSettingsKeyboardHandler(options: SettingsKeyboardOptions): (event: KeyboardEvent) => boolean {
  return createKeyboardCommandMap({
    "/": () => options.onFocusSearch(),
    "Mod+Enter": {
      allowInInputs: true,
      run: () => options.onSaveCurrentSection(),
    },
    "Mod+S": {
      allowInInputs: true,
      run: () => options.onSaveCurrentSection(),
    },
  });
}
