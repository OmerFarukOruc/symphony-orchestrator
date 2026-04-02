const workspaceLocks = new Map<string, Promise<void>>();

export async function withWorkspaceLifecycleLock<T>(workspaceKey: string, task: () => Promise<T>): Promise<T> {
  const previous = workspaceLocks.get(workspaceKey) ?? Promise.resolve();

  let releaseLock: (() => void) | undefined;
  const lock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  workspaceLocks.set(workspaceKey, lock);

  try {
    await previous;
    return await task();
  } finally {
    releaseLock?.();
    if (workspaceLocks.get(workspaceKey) === lock) {
      workspaceLocks.delete(workspaceKey);
    }
  }
}
