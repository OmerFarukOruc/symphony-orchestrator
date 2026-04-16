import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearUnifiedSettingsCache,
  getUnifiedSettingsCache,
  readRequestedSettingsSection,
  syncRequestedSettingsSection,
} from "../../frontend/src/features/settings/unified-settings-page";

describe("unified-settings-page helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    clearUnifiedSettingsCache();
  });

  it("reads credentials and devtools requests from legacy paths and hashes", () => {
    expect(readRequestedSettingsSection({ pathname: "/config", hash: "" })).toEqual({
      section: "devtools",
      shouldReplace: true,
    });

    expect(readRequestedSettingsSection({ pathname: "/settings", hash: "#credentials" })).toEqual({
      section: "credentials",
      shouldReplace: false,
    });
  });

  it("switches the cached workbench into advanced mode for credentials requests", () => {
    const cache = getUnifiedSettingsCache();
    const history = { replaceState: vi.fn() };

    expect(cache.generalWorkbench.state.mode).toBe("simple");

    syncRequestedSettingsSection(cache, { section: "credentials", shouldReplace: false }, history);

    expect(cache.generalWorkbench.state.mode).toBe("advanced");
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it("rewrites legacy routes to canonical settings hashes", () => {
    const cache = getUnifiedSettingsCache();
    const history = { replaceState: vi.fn() };

    syncRequestedSettingsSection(cache, { section: "devtools", shouldReplace: true }, history);

    expect(history.replaceState).toHaveBeenCalledWith({}, "", "/settings#devtools");
  });
});
