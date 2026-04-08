import { describe, it, expect } from "vitest";
import { describeCurrentMoment, describeAttentionZone } from "../../frontend/src/pages/overview-descriptions.js";
import type { AppState } from "../../frontend/src/state/store.js";

type Snapshot = NonNullable<AppState["snapshot"]>;

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    queued: [],
    completed: [],
    counts: { running: 0, retrying: 0, claimed: 0 },
    codex_totals: { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0, seconds_running: 0 },
    recent_events: [],
    workflow_columns: [],
    stall_events: [],
    rate_limits: null,
    system_health: null,
    webhook_health: null,
    ...overrides,
  } as unknown as Snapshot;
}

describe("describeCurrentMoment", () => {
  it("returns intervention state when there are attention issues", () => {
    const snapshot = makeSnapshot({ counts: { running: 2, retrying: 0, claimed: 0 } });
    const result = describeCurrentMoment(snapshot, 3);
    expect(result.state).toBe("3 issues need intervention");
    expect(result.detail).toContain("Blocked");
  });

  it("uses singular form for 1 attention issue", () => {
    const snapshot = makeSnapshot({ counts: { running: 1, retrying: 0, claimed: 0 } });
    const result = describeCurrentMoment(snapshot, 1);
    expect(result.state).toBe("1 issue needs intervention");
  });

  it("returns in-flight state when running and no attention issues", () => {
    const snapshot = makeSnapshot({ counts: { running: 2, retrying: 0, claimed: 0 } });
    const result = describeCurrentMoment(snapshot, 0);
    expect(result.state).toBe("2 issues are in flight");
  });

  it("mentions queued count in detail when running + queued", () => {
    const snapshot = makeSnapshot({
      queued: [{ id: "a" }, { id: "b" }] as unknown as Snapshot["queued"],
      counts: { running: 1, retrying: 0, claimed: 0 },
    });
    const result = describeCurrentMoment(snapshot, 0);
    expect(result.state).toBe("1 issue is in flight");
    expect(result.detail).toContain("2 more");
  });

  it("returns queued state when only queued issues exist", () => {
    const snapshot = makeSnapshot({
      queued: [{ id: "a" }] as unknown as Snapshot["queued"],
      counts: { running: 0, retrying: 0, claimed: 0 },
    });
    const result = describeCurrentMoment(snapshot, 0);
    expect(result.state).toBe("1 issue is queued");
  });

  it("returns clear state when only completed issues exist", () => {
    const snapshot = makeSnapshot({
      completed: [{ id: "a" }] as unknown as Snapshot["completed"],
      counts: { running: 0, retrying: 0, claimed: 0 },
    });
    const result = describeCurrentMoment(snapshot, 0);
    expect(result.state).toBe("Queue is clear");
  });

  it("returns ready-for-first-issue state when everything is empty", () => {
    const snapshot = makeSnapshot();
    const result = describeCurrentMoment(snapshot, 0);
    expect(result.state).toBe("Ready for the first issue");
    expect(result.detail).toContain("Linear");
  });
});

describe("describeAttentionZone", () => {
  it("returns all-clear message when count is 0", () => {
    const result = describeAttentionZone(0);
    expect(result).toContain("Nothing needs your attention");
  });

  it("returns singular message for 1 item", () => {
    const result = describeAttentionZone(1);
    expect(result).toContain("One issue");
  });

  it("returns plural message with count for multiple items", () => {
    const result = describeAttentionZone(5);
    expect(result).toContain("5 issues");
    expect(result).toContain("competing");
  });
});
