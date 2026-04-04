import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shouldMountAgentation } from "../../frontend/src/agentation-island";

function createDocumentMock() {
  return {
    body: {
      dataset: {} as DOMStringMap,
    },
  } as Document;
}

function setWindowHref(href: string): void {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL(href),
  });
}

describe("agentation island", () => {
  beforeEach(() => {
    vi.stubGlobal("document", createDocumentMock());
    setWindowHref("http://127.0.0.1:4000/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not mount agentation by default", () => {
    expect(shouldMountAgentation()).toBe(false);
  });

  it("mounts when the page explicitly enables agentation", () => {
    globalThis.document.body.dataset.agentation = "enabled";

    expect(shouldMountAgentation()).toBe(true);
  });

  it("mounts when the query string opts in", () => {
    setWindowHref("http://127.0.0.1:4000/?agentation=1");

    expect(shouldMountAgentation()).toBe(true);
  });
});
