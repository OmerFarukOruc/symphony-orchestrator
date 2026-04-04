import { describe, expect, it } from "vitest";

import { describeSetupError } from "../../frontend/src/views/setup-shared";

describe("describeSetupError", () => {
  it("tells setup users that a 404 likely means the backend is stale or wrong", () => {
    expect(describeSetupError("404 Not Found")).toEqual({
      title: "This setup endpoint isn't available",
      summary:
        "This usually means the service on this port is running an older build or a different app that does not expose the setup API.",
      retry: "Restart the local Risoluto service, then try again.",
    });
  });
});
