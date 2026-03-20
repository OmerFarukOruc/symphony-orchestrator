import type { RuntimeSnapshot } from "../../frontend/src/types";

function setGlobalProperty(name: "window" | "document", value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
      return;
    }
    Reflect.deleteProperty(globalThis, name);
  };
}

export function installDomHarness(): {
  window: Window;
  document: Document;
  setHidden: (hidden: boolean) => void;
  dispatchVisibilityChange: () => void;
  restore: () => void;
} {
  const fakeWindow = Object.assign(new EventTarget(), {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  });
  const fakeDocument = Object.assign(new EventTarget(), {
    hidden: false,
    getElementById: () => null as HTMLElement | null,
  });

  const restoreWindow = setGlobalProperty("window", fakeWindow);
  const restoreDocument = setGlobalProperty("document", fakeDocument);

  return {
    window: fakeWindow as unknown as Window,
    document: fakeDocument as unknown as Document,
    setHidden(hidden: boolean): void {
      fakeDocument.hidden = hidden;
    },
    dispatchVisibilityChange(): void {
      fakeDocument.dispatchEvent(new Event("visibilitychange"));
    },
    restore(): void {
      restoreDocument();
      restoreWindow();
    },
  };
}

export function createSnapshot(generatedAt: string): RuntimeSnapshot {
  return {
    generated_at: generatedAt,
    counts: { running: 1, retrying: 0 },
    queued: [],
    running: [],
    retrying: [],
    completed: [],
    workflow_columns: [],
    codex_totals: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      seconds_running: 30,
    },
    rate_limits: null,
    recent_events: [],
  };
}

export function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
