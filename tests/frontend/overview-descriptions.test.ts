import { describe, it, expect } from "vitest";
import { describeCurrentMoment } from "../../frontend/src/pages/overview-descriptions.js";
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
    expect(result.state).toBe("3 issues need review");
    expect(result.detail).toContain("review lane");
  });

  it("uses singular form for 1 attention issue", () => {
    const snapshot = makeSnapshot({ counts: { running: 1, retrying: 0, claimed: 0 } });
    const result = describeCurrentMoment(snapshot, 1);
    expect(result.state).toBe("1 issue needs review");
  });

  it("returns in-flight state when running and no attention issues", () => {
    const snapshot = makeSnapshot({ counts: { running: 2, retrying: 0, claimed: 0 } });
    const result = describeCurrentMoment(snapshot, 0);
    expect(result.state).toBe("2 issues are running");
  });

  it("mentions queued count in detail when running + queued", () => {
    const snapshot = makeSnapshot({
      queued: [{ id: "a" }, { id: "b" }] as unknown as Snapshot["queued"],
      counts: { running: 1, retrying: 0, claimed: 0 },
    });
    const result = describeCurrentMoment(snapshot, 0);
    expect(result.state).toBe("1 issue is running");
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
