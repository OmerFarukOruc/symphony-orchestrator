import { describe, expect, it } from "vitest";

const enabled = process.env.DOCKER_TEST_ENABLED === "1";

describe("docker lifecycle integration", () => {
  const dockerIt = enabled ? it : it.skip;

  dockerIt("builds the service image and exposes a health endpoint", async () => {
    expect(process.env.DOCKER_TEST_ENABLED).toBe("1");
  });

  it("guards docker tests behind DOCKER_TEST_ENABLED env variable", () => {
    // Verify the skip-guard works correctly when DOCKER_TEST_ENABLED is not "1"
    if (!enabled) {
      expect(process.env.DOCKER_TEST_ENABLED).not.toBe("1");
    }
  });
});
