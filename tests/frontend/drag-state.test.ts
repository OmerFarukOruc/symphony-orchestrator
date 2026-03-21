import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkflowColumn } from "../../frontend/src/types";

vi.mock("../../frontend/src/api", () => ({
  api: {
    getTransitions: vi.fn(),
    postTransition: vi.fn(),
    postRefresh: vi.fn(),
  },
}));

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function makeColumn(key: string, label: string, identifiers: string[] = []): WorkflowColumn {
  return {
    key,
    label,
    kind: "active",
    terminal: false,
    count: identifiers.length,
    issues: identifiers.map((id) => ({
      issueId: `uuid-${id}`,
      identifier: id,
      title: `Issue ${id}`,
      state: label,
      workspaceKey: null,
      workspacePath: null,
      message: null,
      status: "queued",
      updatedAt: "2026-03-21T00:00:00Z",
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
    })),
  };
}

describe("DragStateManager", () => {
  let apiMock: {
    getTransitions: ReturnType<typeof vi.fn>;
    postTransition: ReturnType<typeof vi.fn>;
    postRefresh: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.resetModules();
    const apiModule = await import("../../frontend/src/api");
    apiMock = apiModule.api as typeof apiMock;
    // Clear any accumulated call counts from prior tests
    apiMock.getTransitions.mockClear();
    apiMock.postTransition.mockClear();
    apiMock.postRefresh.mockClear();
    apiMock.getTransitions.mockResolvedValue({
      transitions: {
        todo: ["in_progress", "done"],
        in_progress: ["done"],
      },
    });
    apiMock.postTransition.mockResolvedValue({ ok: true, from: "Todo", to: "In Progress" });
    apiMock.postRefresh.mockResolvedValue({ queued: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("canDrop returns true optimistically when cache is not loaded", async () => {
    const { createDragStateManager } = await import("../../frontend/src/pages/drag-state");
    const manager = createDragStateManager();

    expect(manager.canDrop("todo", "in_progress")).toBe(true);
    expect(manager.canDrop("todo", "blocked")).toBe(true);
  });

  it("canDrop returns true when source is null", async () => {
    const { createDragStateManager } = await import("../../frontend/src/pages/drag-state");
    const manager = createDragStateManager();

    expect(manager.canDrop(null, "in_progress")).toBe(true);
  });

  it("canDrop validates against cached transitions after prefetch", async () => {
    const { createDragStateManager } = await import("../../frontend/src/pages/drag-state");
    const manager = createDragStateManager();

    manager.prefetchTransitions();
    await flushMicrotasks();

    expect(manager.canDrop("todo", "in_progress")).toBe(true);
    expect(manager.canDrop("todo", "done")).toBe(true);
    expect(manager.canDrop("todo", "blocked")).toBe(false);
    expect(manager.canDrop("in_progress", "done")).toBe(true);
    expect(manager.canDrop("in_progress", "todo")).toBe(false);
  });

  it("onDragStart triggers prefetch", async () => {
    const { createDragStateManager } = await import("../../frontend/src/pages/drag-state");
    const manager = createDragStateManager();

    manager.onDragStart("MT-1", "todo");
    expect(apiMock.getTransitions).toHaveBeenCalled();
  });

  it("prefetchTransitions does not refetch when cache exists", async () => {
    const { createDragStateManager } = await import("../../frontend/src/pages/drag-state");
    const manager = createDragStateManager();

    manager.prefetchTransitions();
    await flushMicrotasks();
    const callCountAfterFirst = apiMock.getTransitions.mock.calls.length;
    manager.prefetchTransitions();

    // Second call should not trigger another fetch
    expect(apiMock.getTransitions).toHaveBeenCalledTimes(callCountAfterFirst);
  });

  it("getTransitionsMap returns null before prefetch", async () => {
    const { createDragStateManager } = await import("../../frontend/src/pages/drag-state");
    const manager = createDragStateManager();

    expect(manager.getTransitionsMap()).toBeNull();
  });

  it("getTransitionsMap returns cached map after prefetch", async () => {
    const { createDragStateManager } = await import("../../frontend/src/pages/drag-state");
    const manager = createDragStateManager();

    manager.prefetchTransitions();
    await flushMicrotasks();

    expect(manager.getTransitionsMap()).toEqual({
      todo: ["in_progress", "done"],
      in_progress: ["done"],
    });
  });

  it("onDrop calls postTransition with target label for valid transitions", async () => {
    const { createDragStateManager } = await import("../../frontend/src/pages/drag-state");
    const manager = createDragStateManager();

    const columns = [makeColumn("todo", "Todo", ["MT-1"]), makeColumn("in_progress", "In Progress")];

    await manager.onDrop("MT-1", "in_progress", columns);

    expect(apiMock.postTransition).toHaveBeenCalledWith("MT-1", "In Progress");
    expect(apiMock.postRefresh).toHaveBeenCalled();
  });

  it("onDrop skips postTransition when transition is not allowed", async () => {
    const { createDragStateManager } = await import("../../frontend/src/pages/drag-state");
    const manager = createDragStateManager();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // in_progress -> todo is not in the transitions map
    const columns = [makeColumn("in_progress", "In Progress", ["MT-2"]), makeColumn("todo", "Todo")];

    apiMock.postTransition.mockClear();
    await manager.onDrop("MT-2", "todo", columns);

    expect(apiMock.postTransition).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("not allowed"));
    consoleSpy.mockRestore();
  });

  it("onDrop does nothing when source column is not found", async () => {
    const { createDragStateManager } = await import("../../frontend/src/pages/drag-state");
    const manager = createDragStateManager();

    const columns = [makeColumn("todo", "Todo")];
    apiMock.postTransition.mockClear();
    await manager.onDrop("UNKNOWN-1", "todo", columns);

    expect(apiMock.postTransition).not.toHaveBeenCalled();
  });

  it("onDrop handles API errors gracefully", async () => {
    const { createDragStateManager } = await import("../../frontend/src/pages/drag-state");
    const manager = createDragStateManager();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    apiMock.postTransition.mockRejectedValueOnce(new Error("Network error"));

    const columns = [makeColumn("todo", "Todo", ["MT-3"]), makeColumn("in_progress", "In Progress")];

    await manager.onDrop("MT-3", "in_progress", columns);

    expect(consoleSpy).toHaveBeenCalledWith("Transition failed:", expect.any(Error));
    consoleSpy.mockRestore();
  });
});
