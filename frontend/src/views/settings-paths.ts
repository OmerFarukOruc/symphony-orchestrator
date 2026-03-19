const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);

export function getValueAtPath(root: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, segment) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    return (value as Record<string, unknown>)[segment];
  }, root);
}

function setRecursive(obj: Record<string, unknown>, segments: string[], value: unknown): void {
  const key = segments[0];
  if (dangerousKeys.has(key)) {
    throw new TypeError(`Refusing to traverse dangerous key: ${key}`);
  }
  if (segments.length === 1) {
    obj[key] = value;
    return;
  }
  const child = obj[key];
  if (!child || typeof child !== "object" || Array.isArray(child)) {
    obj[key] = {};
  }
  setRecursive(obj[key] as Record<string, unknown>, segments.slice(1), value);
}

export function setValueAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  if (parts.length === 0) {
    return;
  }
  setRecursive(target, parts, value);
}
