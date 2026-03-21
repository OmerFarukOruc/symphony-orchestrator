export interface TypingTargetOptions {
  includeSelect?: boolean;
}

export function isTypingTarget(target: EventTarget | null, options: TypingTargetOptions = {}): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (options.includeSelect === true && target instanceof HTMLSelectElement) ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
