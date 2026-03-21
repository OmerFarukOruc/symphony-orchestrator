import { isTypingTarget } from "../utils/dom.js";
import { registerPageCleanup } from "../utils/page.js";

type KeyboardHandler = (event: KeyboardEvent) => boolean | void;
type KeyboardScope = HTMLElement | string | (() => boolean);
type KeyboardTarget = Document | HTMLElement | Window;

export interface RegisterKeyboardScopeOptions {
  ignoreInputs?: boolean;
  scope?: KeyboardScope;
  target?: KeyboardTarget;
}

function isScopeActive(scope: KeyboardScope | undefined): boolean {
  if (scope === undefined) {
    return true;
  }
  if (typeof scope === "string") {
    return window.location.pathname === scope;
  }
  if (typeof scope === "function") {
    return scope();
  }
  return scope.isConnected;
}

export function registerKeyboardScope(
  handler: KeyboardHandler,
  options: RegisterKeyboardScopeOptions = {},
): () => void {
  const target = options.target ?? window;
  let disposed = false;

  const onKey: EventListener = (event): void => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    if (!isScopeActive(options.scope)) {
      return;
    }
    if ((options.ignoreInputs ?? true) && isTypingTarget(event.target)) {
      return;
    }
    handler(event);
  };

  const cleanup = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    target.removeEventListener("keydown", onKey);
  };

  target.addEventListener("keydown", onKey);
  if (options.scope instanceof HTMLElement) {
    registerPageCleanup(options.scope, cleanup);
  }
  return cleanup;
}
