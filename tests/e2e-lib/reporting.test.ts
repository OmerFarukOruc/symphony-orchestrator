import { describe, expect, it } from "vitest";

import { diagnoseProblem, generateJunitXml } from "../../scripts/e2e-lib/reporting.js";
import type { PhaseResult } from "../../scripts/e2e-lib/types.js";

describe("diagnoseProblem", () => {
  it("classifies AUTH_EXPIRED from 401 in stderr", () => {
    const result = diagnoseProblem("HTTP 401 Unauthorized");
    expect(result.category).toBe("AUTH_EXPIRED");
  });

  it("classifies AUTH_EXPIRED from 'unauthorized' keyword", () => {
    const result = diagnoseProblem("request was unauthorized by server");
    expect(result.category).toBe("AUTH_EXPIRED");
  });

  it("classifies DOCKER_OOM from OOMKilled in stderr", () => {
    const result = diagnoseProblem("container OOMKilled");
    expect(result.category).toBe("DOCKER_OOM");
  });

  it("classifies DOCKER_OOM from exit code 137 in attempt record", () => {
    const result = diagnoseProblem("container stopped", { exitCode: 137 });
    expect(result.category).toBe("DOCKER_OOM");
  });

  it("classifies RATE_LIMITED from 429 status", () => {
    const result = diagnoseProblem("HTTP 429 Too Many Requests");
    expect(result.category).toBe("RATE_LIMITED");
  });

  it("classifies RATE_LIMITED from rate limit text", () => {
    const result = diagnoseProblem("rate limit exceeded, retry later");
    expect(result.category).toBe("RATE_LIMITED");
  });

  it("classifies AGENT_TIMEOUT from stall detection", () => {
    const result = diagnoseProblem("stall detected: no events for 120s");
    expect(result.category).toBe("AGENT_TIMEOUT");
  });

  it("classifies AGENT_CRASH from uncaught exception", () => {
    const result = diagnoseProblem("uncaught exception in worker");
    expect(result.category).toBe("AGENT_CRASH");
  });

  it("classifies CONFIG_ERROR from validation failure", () => {
    const result = diagnoseProblem("validation failed: missing field 'model'");
    expect(result.category).toBe("CONFIG_ERROR");
  });

  it("classifies NETWORK_ERROR from ECONNREFUSED", () => {
    const result = diagnoseProblem("connect ECONNREFUSED 127.0.0.1:4111");
    expect(result.category).toBe("NETWORK_ERROR");
  });

  it("classifies NETWORK_ERROR from ETIMEDOUT", () => {
    const result = diagnoseProblem("connect ETIMEDOUT 1.2.3.4:443");
    expect(result.category).toBe("NETWORK_ERROR");
  });

  it("classifies BUILD_FAILURE from pnpm build", () => {
    const result = diagnoseProblem("pnpm build failed with exit code 1");
    expect(result.category).toBe("BUILD_FAILURE");
  });

  it("classifies BUILD_FAILURE from tsc errors", () => {
    const result = diagnoseProblem("tsc: error TS2345: Argument of type 'string'");
    expect(result.category).toBe("BUILD_FAILURE");
  });

  it("returns UNKNOWN for unrecognized patterns", () => {
    const result = diagnoseProblem("something completely different happened");
    expect(result.category).toBe("UNKNOWN");
    expect(result.suggestedFix).toContain("manually");
  });

  it("returns first matching category when multiple rules match", () => {
    // Contains both "401" (AUTH_EXPIRED) and "rate limit" (RATE_LIMITED)
    // AUTH_EXPIRED should win since it's listed first
    const result = diagnoseProblem("HTTP 401 rate limit");
    expect(result.category).toBe("AUTH_EXPIRED");
  });

  it("includes summary and suggestedFix in all results", () => {
    const result = diagnoseProblem("some error");
    expect(typeof result.summary).toBe("string");
    expect(typeof result.suggestedFix).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.suggestedFix.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// generateJunitXml
// ---------------------------------------------------------------------------

describe("generateJunitXml", () => {
  const passPhase: PhaseResult = { phase: "preflight", status: "pass", durationMs: 1200 };
  const failPhase: PhaseResult = {
    phase: "monitor-lifecycle",
    status: "fail",
    durationMs: 300000,
    error: { message: "timeout waiting for completion" },
  };
  const skipPhase: PhaseResult = { phase: "verify-pr", status: "skip", durationMs: 0 };

  it("produces valid XML with all phases passing", () => {
    const xml = generateJunitXml([passPhase]);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('tests="1"');
    expect(xml).toContain('failures="0"');
    expect(xml).toContain('skipped="0"');
    expect(xml).not.toContain("<failure");
    expect(xml).not.toContain("<skipped/>");
  });

  it("includes failure element for failed phases", () => {
    const xml = generateJunitXml([passPhase, failPhase]);
    expect(xml).toContain('tests="2"');
    expect(xml).toContain('failures="1"');
    expect(xml).toContain("<failure");
    expect(xml).toContain("timeout waiting for completion");
  });

  it("includes skipped element for skipped phases", () => {
    const xml = generateJunitXml([passPhase, skipPhase]);
    expect(xml).toContain('tests="2"');
    expect(xml).toContain('skipped="1"');
    expect(xml).toContain("<skipped/>");
    expect(xml).toContain('failures="0"');
  });

  it("escapes XML special characters in error messages", () => {
    const phase: PhaseResult = {
      phase: "test-phase",
      status: "fail",
      durationMs: 100,
      error: { message: 'value <foo> & "bar"' },
    };
    const xml = generateJunitXml([phase]);
    expect(xml).toContain("&lt;foo&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;bar&quot;");
    expect(xml).not.toContain("<foo>");
  });

  it("produces valid XML for zero phases", () => {
    const xml = generateJunitXml([]);
    expect(xml).toContain('tests="0"');
    expect(xml).toContain('failures="0"');
    expect(xml).toContain('skipped="0"');
    expect(xml).toContain("</testsuite>");
  });
});
