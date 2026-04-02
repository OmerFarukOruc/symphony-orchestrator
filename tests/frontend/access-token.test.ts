import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildReadTokenQueryParam, getReadAccessToken, getWriteAccessToken } from "../../frontend/src/access-token";

function createSessionStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => store.clear()),
  };
}

describe("access-token helpers", () => {
  beforeEach(() => {
    const sessionStorage = createSessionStorageMock();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage,
        location: { href: "http://127.0.0.1:4000/" },
        history: { replaceState: vi.fn() },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error test cleanup
    delete globalThis.window;
  });

  it("uses operator tokens for header-based read and write access", () => {
    // @ts-expect-error test override
    globalThis.window.location.href = "http://127.0.0.1:4000/?operator_token=op-secret";

    expect(getReadAccessToken()).toBe("op-secret");
    expect(getWriteAccessToken()).toBe("op-secret");
    expect(buildReadTokenQueryParam()).toBe("");
  });

  it("uses a dedicated read token for query-string auth", () => {
    // @ts-expect-error test override
    globalThis.window.location.href = "http://127.0.0.1:4000/?read_token=read-secret";

    expect(getReadAccessToken()).toBe("read-secret");
    expect(buildReadTokenQueryParam()).toBe("read_token=read-secret");
  });

  it("does not reuse write tokens as read query tokens", () => {
    // @ts-expect-error test override
    globalThis.window.location.href = "http://127.0.0.1:4000/?write_token=write-secret";

    expect(getReadAccessToken()).toBe("write-secret");
    expect(getWriteAccessToken()).toBe("write-secret");
    expect(buildReadTokenQueryParam()).toBe("");
  });
});
