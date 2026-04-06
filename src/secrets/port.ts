/**
 * SecretsPort — minimal interface for encrypted secret storage.
 *
 * Consumers depend on this interface rather than the concrete SecretsStore
 * so that test doubles can be injected without pulling in the file-system
 * encryption implementation.
 */

export interface SecretsPort {
  /** Returns true once initializeWithKey() or start() has been called. */
  isInitialized(): boolean;

  /** Initialize the store with a master key at runtime (deferred mode). */
  initializeWithKey(masterKey: string): Promise<void>;

  /** Clear all secrets and reset the encryption key. */
  reset(): void;

  /** Subscribe to change notifications. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;

  /** Return all secret keys in sorted order. */
  list(): string[];

  /** Retrieve a secret by key, or null if not found. */
  get(key: string): string | null;

  /** Store or update a secret. Persists and notifies listeners. */
  set(key: string, value: string): Promise<void>;

  /** Delete a secret. Returns true if it existed. Persists and notifies listeners. */
  delete(key: string): Promise<boolean>;

  /** Start the store by loading and decrypting the secrets file. */
  start(): Promise<void>;

  /** Create the base directory without requiring a master key. */
  startDeferred(): Promise<void>;
}
