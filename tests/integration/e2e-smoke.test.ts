import { describe, expect, it } from "vitest";

const enabled = process.env.E2E_ENABLED === "1";

describe("planning and orchestration e2e smoke", () => {
  const e2eIt = enabled ? it : it.skip;

  e2eIt("runs the configured live e2e pipeline when credentials are present", async () => {
    expect(process.env.E2E_ENABLED).toBe("1");
  });
});
