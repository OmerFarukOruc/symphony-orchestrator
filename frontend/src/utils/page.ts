export function registerPageCleanup(root: HTMLElement, cleanup: () => void): void {
  let disposed = false;
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    window.removeEventListener("router:navigate", onNavigate);
    cleanup();
  };
  const onNavigate = (): void => {
    if (!root.isConnected) {
      dispose();
    }
  };
  window.addEventListener("router:navigate", onNavigate);
  window.setTimeout(() => {
    if (!root.isConnected) {
      dispose();
    }
  }, 0);
}
