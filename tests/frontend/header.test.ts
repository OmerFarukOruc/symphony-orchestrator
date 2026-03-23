import { describe, expect, it } from "vitest";

import { getHeaderNavButtonState } from "../../frontend/src/ui/header";

describe("getHeaderNavButtonState", () => {
  it("omits the header navigation button outside mobile layouts", () => {
    expect(
      getHeaderNavButtonState({
        mobile: false,
        mobileOpen: false,
      }),
    ).toEqual({
      visible: false,
      title: "Open navigation",
      ariaExpanded: "false",
    });
  });

  it("uses close affordances when the mobile drawer is open", () => {
    expect(
      getHeaderNavButtonState({
        mobile: true,
        mobileOpen: true,
      }),
    ).toEqual({
      visible: true,
      title: "Close navigation",
      ariaExpanded: "true",
    });
  });
});
