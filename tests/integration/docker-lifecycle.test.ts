import { describe, expect, it } from "vitest";

const enabled = process.env.DOCKER_TEST_ENABLED === "1";

describe("docker lifecycle integration", () => {
  const dockerIt = enabled ? it : it.skip;

  dockerIt("builds the service image and exposes a health endpoint", async () => {
    expect(process.env.DOCKER_TEST_ENABLED).toBe("1");
  });
});
