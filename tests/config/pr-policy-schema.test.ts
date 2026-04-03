import { describe, expect, it } from "vitest";

import { mergePolicyConfigSchema } from "../../src/config/schemas/pr-policy.js";
import { agentConfigSchema } from "../../src/config/schemas/agent.js";

describe("mergePolicyConfigSchema", () => {
  it("applies defaults for empty input", () => {
    const result = mergePolicyConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.allowedPaths).toEqual([]);
    expect(result.requireLabels).toEqual([]);
    expect(result.excludeLabels).toEqual([]);
    expect(result.maxChangedFiles).toBeUndefined();
    expect(result.maxDiffLines).toBeUndefined();
  });

  it("accepts a fully populated object", () => {
    const result = mergePolicyConfigSchema.parse({
      enabled: true,
      allowedPaths: ["src/", "tests/"],
      maxChangedFiles: 20,
      maxDiffLines: 500,
      requireLabels: ["safe-to-merge"],
      excludeLabels: ["do-not-merge", "wip"],
    });
    expect(result.enabled).toBe(true);
    expect(result.allowedPaths).toEqual(["src/", "tests/"]);
    expect(result.maxChangedFiles).toBe(20);
    expect(result.maxDiffLines).toBe(500);
    expect(result.requireLabels).toEqual(["safe-to-merge"]);
    expect(result.excludeLabels).toEqual(["do-not-merge", "wip"]);
  });

  it("parses with enabled: false without error", () => {
    const result = mergePolicyConfigSchema.parse({ enabled: false });
    expect(result.enabled).toBe(false);
  });

  it("accepts missing optional fields and applies defaults", () => {
    const result = mergePolicyConfigSchema.parse({ enabled: true, allowedPaths: ["src/"] });
    expect(result.enabled).toBe(true);
    expect(result.allowedPaths).toEqual(["src/"]);
    expect(result.requireLabels).toEqual([]);
    expect(result.excludeLabels).toEqual([]);
    expect(result.maxChangedFiles).toBeUndefined();
    expect(result.maxDiffLines).toBeUndefined();
  });

  it("rejects non-integer maxChangedFiles", () => {
    expect(() => mergePolicyConfigSchema.parse({ maxChangedFiles: 3.5 })).toThrow();
  });

  it("rejects non-integer maxDiffLines", () => {
    expect(() => mergePolicyConfigSchema.parse({ maxDiffLines: 1.2 })).toThrow();
  });
});

describe("agentConfigSchema — new PR/CI fields", () => {
  it("applies defaults for autoRetryOnReviewFeedback", () => {
    const result = agentConfigSchema.parse({});
    expect(result.autoRetryOnReviewFeedback).toBe(false);
  });

  it("applies default for prMonitorIntervalMs (60 seconds)", () => {
    const result = agentConfigSchema.parse({});
    expect(result.prMonitorIntervalMs).toBe(60000);
  });

  it("applies autoMerge defaults", () => {
    const result = agentConfigSchema.parse({});
    expect(result.autoMerge.enabled).toBe(false);
    expect(result.autoMerge.allowedPaths).toEqual([]);
    expect(result.autoMerge.requireLabels).toEqual([]);
    expect(result.autoMerge.excludeLabels).toEqual([]);
  });

  it("preserves autoRetryOnReviewFeedback: true", () => {
    const result = agentConfigSchema.parse({ autoRetryOnReviewFeedback: true });
    expect(result.autoRetryOnReviewFeedback).toBe(true);
  });

  it("preserves custom prMonitorIntervalMs", () => {
    const result = agentConfigSchema.parse({ prMonitorIntervalMs: 30000 });
    expect(result.prMonitorIntervalMs).toBe(30000);
  });

  it("rejects prMonitorIntervalMs below 10000", () => {
    expect(() => agentConfigSchema.parse({ prMonitorIntervalMs: 5000 })).toThrow();
  });

  it("rejects non-integer prMonitorIntervalMs", () => {
    expect(() => agentConfigSchema.parse({ prMonitorIntervalMs: 60000.5 })).toThrow();
  });

  it("preserves a fully populated autoMerge block", () => {
    const result = agentConfigSchema.parse({
      autoMerge: {
        enabled: true,
        allowedPaths: ["src/", "tests/"],
        maxChangedFiles: 10,
        maxDiffLines: 200,
        requireLabels: ["ready"],
        excludeLabels: ["wip"],
      },
    });
    expect(result.autoMerge.enabled).toBe(true);
    expect(result.autoMerge.allowedPaths).toEqual(["src/", "tests/"]);
    expect(result.autoMerge.maxChangedFiles).toBe(10);
    expect(result.autoMerge.maxDiffLines).toBe(200);
    expect(result.autoMerge.requireLabels).toEqual(["ready"]);
    expect(result.autoMerge.excludeLabels).toEqual(["wip"]);
  });

  it("full empty parse includes all three new fields with correct defaults", () => {
    const result = agentConfigSchema.parse({});
    expect(result).toMatchObject({
      autoRetryOnReviewFeedback: false,
      prMonitorIntervalMs: 60000,
      autoMerge: {
        enabled: false,
        allowedPaths: [],
        requireLabels: [],
        excludeLabels: [],
      },
    });
  });
});
