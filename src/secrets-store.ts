import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { asStringRecord, isRecord } from "./utils/type-guards.js";
import type { SymphonyLogger } from "./types.js";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;

interface SecretsEnvelope {
  version: number;
  algorithm: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

function deriveKey(masterKey: string): Buffer {
  return createHash("sha256").update(masterKey, "utf8").digest();
}

function encodeEnvelope(envelope: SecretsEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

function parseEnvelope(source: string): SecretsEnvelope {
  const parsed = JSON.parse(source) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("secrets envelope must be a JSON object");
  }

  const version = parsed.version;
  const algorithm = parsed.algorithm;
  const iv = parsed.iv;
  const authTag = parsed.authTag;
  const ciphertext = parsed.ciphertext;

  if (version !== 1) {
    throw new Error(`unsupported secrets envelope version: ${String(version)}`);
  }
  if (algorithm !== ENCRYPTION_ALGORITHM) {
    throw new Error(`unsupported secrets algorithm: ${String(algorithm)}`);
  }
  if (typeof iv !== "string" || typeof authTag !== "string" || typeof ciphertext !== "string") {
    throw new Error("secrets envelope contains invalid binary fields");
  }

  return {
    version,
    algorithm,
    iv,
    authTag,
    ciphertext,
  };
}

function encrypt(plaintext: string, key: Buffer): SecretsEnvelope {
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: ENCRYPTION_ALGORITHM,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decrypt(envelope: SecretsEnvelope, key: Buffer): string {
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

export class SecretsStore {
  private readonly cache = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private encryptionKey: Buffer | null = null;

  constructor(
    private readonly baseDir: string,
    private readonly logger: SymphonyLogger,
    private readonly options?: { masterKey?: string },
  ) {}

  async start(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });

    const masterKey = this.options?.masterKey ?? process.env.MASTER_KEY ?? "";
    if (!masterKey) {
      throw new Error("MASTER_KEY is required to initialize SecretsStore");
    }
    this.encryptionKey = deriveKey(masterKey);

    let source: string;
    try {
      source = await readFile(this.secretsPath(), "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        await this.persist();
        return;
      }
      throw error;
    }

    const envelope = parseEnvelope(source);
    const decrypted = decrypt(envelope, this.requiredKey());
    const secrets = asStringRecord(JSON.parse(decrypted) as unknown);
    this.cache.clear();
    for (const [key, value] of Object.entries(secrets)) {
      this.cache.set(key, value);
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  list(): string[] {
    return [...this.cache.keys()].sort((left, right) => left.localeCompare(right));
  }

  get(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    if (!key.trim()) {
      throw new Error("secret key must not be empty");
    }
    this.cache.set(key, value);
    await this.persist();
    await this.appendAuditEntry("set", key);
    this.notify();
  }

  async delete(key: string): Promise<boolean> {
    const existed = this.cache.delete(key);
    if (!existed) {
      return false;
    }

    await this.persist();
    await this.appendAuditEntry("delete", key);
    this.notify();
    return true;
  }

  private requiredKey(): Buffer {
    if (!this.encryptionKey) {
      throw new Error("SecretsStore has not been started");
    }
    return this.encryptionKey;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async appendAuditEntry(operation: "set" | "delete", key: string): Promise<void> {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      operation,
      key,
    });
    await appendFile(this.auditPath(), `${line}\n`, "utf8");
  }

  private async persist(): Promise<void> {
    const serializedSecrets = JSON.stringify(Object.fromEntries(this.cache), null, 2);
    const envelope = encrypt(serializedSecrets, this.requiredKey());
    const temporaryPath = `${this.secretsPath()}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporaryPath, encodeEnvelope(envelope), "utf8");
    await rename(temporaryPath, this.secretsPath());
  }

  private secretsPath(): string {
    return path.join(this.baseDir, "secrets.enc");
  }

  private auditPath(): string {
    return path.join(this.baseDir, "secrets.audit.log");
  }
}
