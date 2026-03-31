/**
 * DB-backed secret store with per-key AES-256-GCM encryption.
 *
 * Each secret is stored as its own row in the `encrypted_secrets` table
 * with an individual IV + authTag. Key names are plaintext (visible in DB);
 * values are encrypted. See docs/TRUST_AND_AUTH.md for trust model.
 *
 * Implements the same public API as the file-backed SecretsStore so
 * consumers can swap without changes.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import type { RisolutoDatabase } from "../persistence/sqlite/database.js";
import { encryptedSecrets } from "../persistence/sqlite/schema.js";
import type { RisolutoLogger } from "../core/types.js";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;

function deriveKey(masterKey: string): Buffer {
  return createHash("sha256").update(masterKey, "utf8").digest();
}

function encryptValue(plaintext: string, key: Buffer): { ciphertext: string; iv: string; authTag: string } {
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptValue(ciphertext: string, iv: string, authTag: string, key: Buffer): string {
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(iv, "base64"), { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

export class DbSecretsStore {
  private encryptionKey: Buffer | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly db: RisolutoDatabase,
    private readonly logger: RisolutoLogger,
    private readonly options?: { masterKey?: string },
  ) {}

  async start(): Promise<void> {
    const masterKey = this.options?.masterKey ?? process.env.MASTER_KEY ?? "";
    if (!masterKey) {
      throw new Error("MASTER_KEY is required to initialize DbSecretsStore");
    }
    this.encryptionKey = deriveKey(masterKey);
  }

  async startDeferred(): Promise<void> {
    /* DB is already open via PersistenceRuntime */
  }

  async initializeWithKey(masterKey: string): Promise<void> {
    this.encryptionKey = deriveKey(masterKey);
    this.notify();
  }

  isInitialized(): boolean {
    return this.encryptionKey !== null;
  }

  reset(): void {
    this.encryptionKey = null;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(): string[] {
    const rows = this.db.select({ key: encryptedSecrets.key }).from(encryptedSecrets).all();
    return rows.map((row) => row.key).sort((left, right) => left.localeCompare(right));
  }

  get(key: string): string | null {
    if (!this.encryptionKey) return null;
    const row = this.db.select().from(encryptedSecrets).where(eq(encryptedSecrets.key, key)).get();
    if (!row) return null;
    try {
      return decryptValue(row.ciphertext, row.iv, row.authTag, this.encryptionKey);
    } catch (error) {
      this.logger.warn({ key, error: String(error) }, "failed to decrypt secret");
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!key.trim()) throw new Error("secret key must not be empty");
    const encKey = this.requiredKey();
    const { ciphertext, iv, authTag } = encryptValue(value, encKey);
    const now = new Date().toISOString();

    const existing = this.db.select().from(encryptedSecrets).where(eq(encryptedSecrets.key, key)).get();
    if (existing) {
      this.db
        .update(encryptedSecrets)
        .set({ ciphertext, iv, authTag, updatedAt: now })
        .where(eq(encryptedSecrets.key, key))
        .run();
    } else {
      this.db.insert(encryptedSecrets).values({ key, ciphertext, iv, authTag, updatedAt: now }).run();
    }
    this.notify();
  }

  async delete(key: string): Promise<boolean> {
    const existing = this.db.select().from(encryptedSecrets).where(eq(encryptedSecrets.key, key)).get();
    if (!existing) return false;
    this.db.delete(encryptedSecrets).where(eq(encryptedSecrets.key, key)).run();
    this.notify();
    return true;
  }

  private requiredKey(): Buffer {
    if (!this.encryptionKey) throw new Error("DbSecretsStore has not been started");
    return this.encryptionKey;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
