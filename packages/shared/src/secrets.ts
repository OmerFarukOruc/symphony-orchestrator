/**
 * Secret storage backend interface.
 *
 * The concrete `SecretsStore` in `src/secrets/store.ts` uses AES-256-GCM
 * encryption with file + SQLite dual-write.  This interface describes
 * the consumer-facing surface only.
 */
export interface SecretBackend {
  /** Whether the backend has been initialized with a master key. */
  isInitialized(): boolean;

  /** List all stored secret key names. */
  list(): string[];

  /** Retrieve a stored secret value by key, or null if not found. */
  get(key: string): string | null;

  /** Store a secret value under the given key. */
  set(key: string, value: string): Promise<void>;

  /** Delete a stored secret. Returns true if the key existed. */
  delete(key: string): Promise<boolean>;

  /** Subscribe to secret change notifications. Returns unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
