import { describe, expect, it } from "vitest";

import { buildRouteRenderKey, resolveSetupRoutingState } from "../../packages/frontend/src/routing";

describe("react routing helpers", () => {
  it("keeps routing pending until setup status has loaded", () => {
    expect(resolveSetupRoutingState(undefined, false)).toBe("pending");
    expect(resolveSetupRoutingState({ configured: false }, false)).toBe("setup-required");
    expect(resolveSetupRoutingState({ configured: true }, false)).toBe("configured");
    expect(resolveSetupRoutingState(undefined, true)).toBe("configured");
  });

  it("builds a stable route render key for identical params", () => {
    const firstKey = buildRouteRenderKey("/issues/MT-42/runs", "#latest", { id: "MT-42" });
    const secondKey = buildRouteRenderKey("/issues/MT-42/runs", "#latest", { id: "MT-42" });

    expect(firstKey).toBe(secondKey);
  });
});
