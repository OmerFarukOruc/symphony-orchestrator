export interface ConfigOverlayInterface {
  /** Retrieve the full overlay as a deep-cloned map. */
  toMap(): Record<string, unknown>;

  /** Replace the entire overlay map atomically. Returns true if changed. */
  replace(nextMap: Record<string, unknown>): Promise<boolean>;

  /** Deep-merge a patch into the current overlay. Returns true if changed. */
  applyPatch(patch: Record<string, unknown>): Promise<boolean>;

  /** Set a single dot-path value. Returns true if changed. */
  set(pathExpression: string, value: unknown): Promise<boolean>;

  /** Delete a single dot-path key. Returns true if the key existed. */
  delete(pathExpression: string): Promise<boolean>;

  /** Atomically apply multiple set/delete operations. Returns true if changed. */
  setBatch(entries: Array<{ path: string; value: unknown }>, deletions?: string[]): Promise<boolean>;

  /** Subscribe to overlay change notifications. Returns unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
