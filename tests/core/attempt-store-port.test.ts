import { describe, expect, it } from "vitest";

import * as attemptStorePortModule from "../../src/core/attempt-store-port.js";

describe("attempt-store-port module", () => {
  it("stays a pure contract module at runtime", () => {
    expect(Object.keys(attemptStorePortModule)).toEqual([]);
  });
});
