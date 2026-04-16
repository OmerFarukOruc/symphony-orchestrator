import { beforeEach, describe, expect, it, vi } from "vitest";

import { createQueueWorkbench } from "../../frontend/src/features/queue/queue-workbench";
import type { RouterNavigateDetail } from "../../frontend/src/router";
import type { AppState } from "../../frontend/src/state/store";
import type { RecentEvent, RuntimeSnapshot, WorkflowColumn } from "../../frontend/src/types";
import { createSnapshot } from "./helpers";

function createIssue(identifier: string, overrides: Record<string, unknown> = {}) {
  return {
    issueId: `uuid-${identifier}`,
    identifier,
    title: `Issue ${identifier}`,
    state: "Todo",
    workspaceKey: null,
    workspacePath: null,
    message: null,
    status: "queued",
    updatedAt: "2026-04-15T00:00:00.000Z",
    attempt: null,
    error: null,
    priority: null,
    labels: [],
    startedAt: null,
    lastEventAt: null,
    tokenUsage: null,
    model: null,
    reasoningEffort: null,
    modelSource: null,
    configuredModel: null,
    configuredReasoningEffort: null,
    configuredModelSource: null,
    modelChangePending: false,
    ...overrides,
  };
}

function createColumn(key: string, label: string, identifiers: string[]): WorkflowColumn {
  return {
    key,
    label,
    kind: "active",
    terminal: false,
    count: identifiers.length,
    issues: identifiers.map((identifier) => createIssue(identifier)),
  };
}

function createRecentEvent(overrides: Partial<RecentEvent> = {}): RecentEvent {
  return {
    at: "2026-04-15T10:00:00.000Z",
    issue_id: "issue-1",
    issue_identifier: "ENG-1",
    session_id: "session-1",
    event: "agent_message",
    message: "Agent replied",
    content: "Working on it",
    ...overrides,
  };
}

function createAppState(snapshot: RuntimeSnapshot | null): AppState {
  return {
    snapshot,
    staleCount: 0,
  };
}

function createQueueSnapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    ...createSnapshot("2026-04-15T10:00:00.000Z"),
    workflow_columns: [createColumn("todo", "Todo", ["ENG-1"]), createColumn("in_progress", "In Progress", ["ENG-2"])],
    recent_events: [createRecentEvent()],
    ...overrides,
  };
}

function createHarness(snapshot: RuntimeSnapshot = createQueueSnapshot()) {
  let stateHandler: ((state: AppState) => void) | null = null;
  let navigationHandler: ((detail: RouterNavigateDetail) => void) | null = null;

  const api = {
    postRefresh: vi.fn(async () => ({ queued: true })),
  };
  const router = {
    navigate: vi.fn(),
    subscribe: vi.fn((handler: (detail: RouterNavigateDetail) => void) => {
      navigationHandler = handler;
      return () => {
        navigationHandler = null;
      };
    }),
  };
  const runtimeClient = {
    getAppState: vi.fn(() => createAppState(snapshot)),
    subscribeState: vi.fn((handler: (state: AppState) => void) => {
      stateHandler = handler;
      return () => {
        stateHandler = null;
      };
    }),
  };

  return {
    api,
    router,
    runtimeClient,
    emitState(nextSnapshot: RuntimeSnapshot | null): void {
      stateHandler?.(createAppState(nextSnapshot));
    },
    navigate(detail: RouterNavigateDetail): void {
      navigationHandler?.(detail);
    },
  };
}

function createKeyEvent(
  key: string,
  options: { shiftKey?: boolean; target?: EventTarget | null } = {},
): KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  return {
    key,
    shiftKey: options.shiftKey ?? false,
    target: options.target ?? null,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

describe("queue-workbench", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    if (!("HTMLElement" in globalThis)) {
      Object.defineProperty(globalThis, "HTMLElement", {
        configurable: true,
        writable: true,
        value: class HTMLElement {},
      });
    }
  });

  it("hydrates runtime state and route-aware inspector selection behind one boundary", () => {
    const harness = createHarness();
    const workbench = createQueueWorkbench({
      routeId: "ENG-1",
      deps: {
        api: harness.api,
        router: harness.router,
        runtimeClient: harness.runtimeClient,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
      },
    });
    const listener = vi.fn();

    workbench.subscribe(listener);
    workbench.initialize();

    expect(harness.runtimeClient.getAppState).toHaveBeenCalledTimes(1);
    expect(workbench.state.hasSnapshot).toBe(true);
    expect(workbench.state.columns.map((column) => column.key)).toEqual(["todo", "in_progress"]);
    expect(workbench.state.recentEvents).toEqual([expect.objectContaining({ issue_identifier: "ENG-1" })]);
    expect(workbench.state.routeId).toBe("ENG-1");
    expect(listener).toHaveBeenCalled();

    harness.navigate({ path: "/queue/ENG-2", params: { id: "ENG-2" }, title: "Queue" });
    expect(workbench.state.routeId).toBe("ENG-2");

    harness.emitState(
      createQueueSnapshot({
        workflow_columns: [createColumn("review", "Review", ["ENG-9"])],
        recent_events: [createRecentEvent({ issue_identifier: "ENG-9", message: "Moved to review" })],
      }),
    );

    expect(workbench.state.columns.map((column) => column.key)).toEqual(["review"]);
    expect(workbench.state.recentEvents).toEqual([expect.objectContaining({ issue_identifier: "ENG-9" })]);
  });

  it("throttles refresh requests behind the workbench boundary", async () => {
    const harness = createHarness();
    const workbench = createQueueWorkbench({
      deps: {
        api: harness.api,
        router: harness.router,
        runtimeClient: harness.runtimeClient,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
      },
    });

    await workbench.refresh();
    await workbench.refresh();
    expect(harness.api.postRefresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_000);
    await workbench.refresh();
    expect(harness.api.postRefresh).toHaveBeenCalledTimes(2);
  });

  it("owns queue filters and keyboard issue actions through one module boundary", () => {
    const harness = createHarness(
      createQueueSnapshot({
        workflow_columns: [createColumn("todo", "Todo", ["ENG-1"])],
      }),
    );
    const workbench = createQueueWorkbench({
      routeId: "ENG-1",
      deps: {
        api: harness.api,
        router: harness.router,
        runtimeClient: harness.runtimeClient,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
      },
    });
    const search = {
      focus: vi.fn(),
    } as unknown as HTMLInputElement;

    workbench.initialize();
    workbench.setSearchText("auth");
    workbench.toggleStage("todo");
    workbench.setPriority("high");

    expect(workbench.state.filters.search).toBe("auth");
    expect(workbench.state.filters.stages.has("todo")).toBe(true);
    expect(workbench.state.filters.priority).toBe("high");

    const searchEvent = createKeyEvent("/");
    workbench.handleKeyboard(searchEvent, { search });
    expect(search.focus).toHaveBeenCalledTimes(1);
    expect(searchEvent.preventDefault).toHaveBeenCalledTimes(1);

    workbench.handleKeyboard(createKeyEvent("Escape"), { search });
    expect(workbench.state.filters.search).toBe("");
    expect(workbench.state.filters.stages.size).toBe(0);
    expect(workbench.state.filters.priority).toBe("all");
    expect(harness.router.navigate).not.toHaveBeenCalled();

    workbench.handleKeyboard(createKeyEvent("Enter", { shiftKey: true }), { search });
    expect(harness.router.navigate).toHaveBeenLastCalledWith("/issues/ENG-1");

    workbench.handleKeyboard(createKeyEvent("Escape"), { search });
    expect(harness.router.navigate).toHaveBeenLastCalledWith("/queue");
  });
});
