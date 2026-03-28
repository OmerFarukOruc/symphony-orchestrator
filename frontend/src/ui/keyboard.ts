import type { Router } from "../router";
import { openShortcutHelp } from "./shortcut-help.js";

let prefixActive = false;
let prefixTimer = 0;

interface KeyboardOptions {
  resolveRunHistoryPath?: () => string | null;
}

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
  );
}

function resetPrefix(): void {
  prefixActive = false;
  window.clearTimeout(prefixTimer);
}

function dispatchKeyEvent(name: string): void {
  window.dispatchEvent(new CustomEvent(name));
}

function handlePrefixKey(event: KeyboardEvent, router: Router, options: KeyboardOptions): void {
  const nextKey = event.key.toLowerCase();
  const runsPath = options.resolveRunHistoryPath?.();
  const destinations: Record<string, string> = {
    o: "/",
    q: "/queue",
    c: "/settings#devtools",
    s: "/settings#credentials",
    m: "/observability",
    n: "/notifications",
    g: "/git",
    d: "/containers",
    w: "/workspaces",
    ",": "/settings",
    t: "/templates",
    a: "/audit",
  };
  resetPrefix();
  if (nextKey === "r") {
    if (runsPath) {
      event.preventDefault();
      router.navigate(runsPath);
    }
    return;
  }
  if (destinations[nextKey]) {
    event.preventDefault();
    router.navigate(destinations[nextKey]);
  }
}

function handlePlainKey(event: KeyboardEvent): void {
  if (event.key === "j") dispatchKeyEvent("keyboard:j");
  if (event.key === "k") dispatchKeyEvent("keyboard:k");
  if (event.key === "Enter" && event.shiftKey) {
    dispatchKeyEvent("keyboard:shift-enter");
  } else if (event.key === "Enter") {
    dispatchKeyEvent("keyboard:enter");
  }
  if (event.key === "Escape") dispatchKeyEvent("keyboard:escape");
}

export function initKeyboard(router: Router, options: KeyboardOptions = {}): void {
  window.addEventListener("keydown", (event) => {
    if (shouldIgnoreTarget(event.target)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      dispatchKeyEvent("palette:open");
      return;
    }
    if (event.key === "?") {
      event.preventDefault();
      openShortcutHelp();
      return;
    }
    if (event.key === "g") {
      prefixActive = true;
      window.clearTimeout(prefixTimer);
      prefixTimer = window.setTimeout(() => resetPrefix(), 1_500);
      return;
    }
    if (prefixActive) {
      handlePrefixKey(event, router, options);
      return;
    }
    handlePlainKey(event);
  });
}
