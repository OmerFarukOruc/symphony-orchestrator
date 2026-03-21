import { createKeyboardCommandMap } from "../ui/keyboard-commands.js";

interface PlannerKeyboardOptions {
  hasPlan: boolean;
  modalOpen: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGenerate: () => void;
  onOpenExecute: () => void;
  onCloseExecute: () => void;
}

export function createPlannerKeyboardHandler(options: PlannerKeyboardOptions): (event: KeyboardEvent) => boolean {
  return createKeyboardCommandMap(
    {
      j: {
        preventDefault: false,
        run: () => options.onNext(),
        when: () => options.hasPlan,
      },
      k: {
        preventDefault: false,
        run: () => options.onPrev(),
        when: () => options.hasPlan,
      },
      "Shift+Enter": {
        run: () => options.onOpenExecute(),
        when: () => options.hasPlan,
      },
      "Mod+Enter": {
        allowInInputs: true,
        run: () => options.onGenerate(),
      },
      Escape: {
        preventDefault: false,
        run: () => options.onCloseExecute(),
        when: () => options.modalOpen,
      },
    },
    { typingTargetOptions: { includeSelect: true } },
  );
}
