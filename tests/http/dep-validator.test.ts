import { describe, expect, it } from "vitest";

import { validateHttpDeps } from "../../src/http/dep-validator.js";
import { createMockLogger } from "../helpers.js";

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    orchestrator: {} as never,
    logger: createMockLogger(),
    ...overrides,
  };
}

describe("validateHttpDeps", () => {
  it("throws when webhook mode is configured without webhook handler deps", () => {
    expect(() =>
      validateHttpDeps(
        makeDeps({
          configStore: {
            getConfig: () => ({
              webhook: { webhookUrl: "https://example.com/webhooks/linear" },
              triggers: {},
            }),
          },
        }) as never,
      ),
    ).toThrow(/webhook handler dependencies/i);
  });

  it("throws when trigger mode is configured without a tracker", () => {
    expect(() =>
      validateHttpDeps(
        makeDeps({
          configStore: {
            getConfig: () => ({
              webhook: {},
              triggers: { apiKey: "secret" },
            }),
          },
        }) as never,
      ),
    ).toThrow(/tracker dependency/i);
  });

  it("does not throw when optional deps are absent but no dependent feature is configured", () => {
    expect(() =>
      validateHttpDeps(
        makeDeps({
          configStore: {
            getConfig: () => ({
              webhook: {},
              triggers: {},
            }),
          },
        }) as never,
      ),
    ).not.toThrow();
  });
});
