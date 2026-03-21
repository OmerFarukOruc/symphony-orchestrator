import { isTypingTarget } from "../utils/dom.js";
import type { TypingTargetOptions } from "../utils/dom.js";

type KeyboardCommandAction = () => void;

export interface KeyboardCommand {
  allowInInputs?: boolean;
  preventDefault?: boolean;
  run: KeyboardCommandAction;
  when?: () => boolean;
}

export type KeyboardCommandDefinition = KeyboardCommand | KeyboardCommandAction;
export type KeyboardCommandMap = Record<string, KeyboardCommandDefinition>;

export interface CreateKeyboardCommandMapOptions {
  ignoreInputs?: boolean;
  preventDefault?: boolean;
  typingTargetOptions?: TypingTargetOptions;
}

function toKeyboardCommand(definition: KeyboardCommandDefinition): KeyboardCommand {
  if (typeof definition === "function") {
    return { run: definition };
  }
  return definition;
}

function normalizeEventKey(key: string): string {
  if (key === " ") {
    return "Space";
  }
  return key.length === 1 ? key.toLowerCase() : key;
}

function getCommandKey(event: KeyboardEvent): string {
  const parts: string[] = [];
  const key = normalizeEventKey(event.key);
  if ((event.ctrlKey || event.metaKey) && key !== "Control" && key !== "Meta") {
    parts.push("Mod");
  }
  if (event.altKey && key !== "Alt") {
    parts.push("Alt");
  }
  if (event.shiftKey && key !== "Shift") {
    parts.push("Shift");
  }
  parts.push(key);
  return parts.join("+");
}

export function createKeyboardCommandMap(
  map: KeyboardCommandMap,
  options: CreateKeyboardCommandMapOptions = {},
): (event: KeyboardEvent) => boolean {
  return (event: KeyboardEvent): boolean => {
    const command = map[getCommandKey(event)];
    if (!command) {
      return false;
    }

    const definition = toKeyboardCommand(command);
    if (
      (options.ignoreInputs ?? true) &&
      !definition.allowInInputs &&
      isTypingTarget(event.target, options.typingTargetOptions)
    ) {
      return false;
    }

    if (definition.when && !definition.when()) {
      return false;
    }

    if (definition.preventDefault ?? options.preventDefault ?? true) {
      event.preventDefault();
    }

    definition.run();
    return true;
  };
}
