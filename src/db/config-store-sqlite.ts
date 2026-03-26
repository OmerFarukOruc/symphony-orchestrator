import { asc, eq } from "drizzle-orm";

import type { SymphonyLogger } from "../core/types.js";
import { buildOverlayMap, normalizeOverlayPath, type ConfigOverlayEntry } from "../config/overlay-map.js";
import { closeDatabaseConnection, openDatabaseConnection, type SqliteConnection } from "./connection.js";
import { configOverlays } from "./schema.js";

export interface ConfigOverlayPersistenceStore {
  load(): Promise<Record<string, unknown>>;
  save(path: string, value: unknown): Promise<void>;
  delete(path: string): Promise<boolean>;
  list(): Promise<ConfigOverlayEntry[]>;
  replaceAll?(entries: ConfigOverlayEntry[]): Promise<void>;
  close?(): void;
}

function toStoredPath(pathExpression: string): string {
  const segments = normalizeOverlayPath(pathExpression);
  if (segments.length === 0) {
    throw new Error("overlay path must contain at least one segment");
  }
  return segments.join(".");
}

export class ConfigStoreSqlite implements ConfigOverlayPersistenceStore {
  private connection: SqliteConnection | null = null;

  constructor(
    private readonly baseDir: string,
    private readonly logger: SymphonyLogger,
    private readonly options?: { dbPath?: string | null },
  ) {}

  async load(): Promise<Record<string, unknown>> {
    return buildOverlayMap(await this.list());
  }

  async save(pathExpression: string, value: unknown): Promise<void> {
    const path = toStoredPath(pathExpression);
    const updatedAt = new Date().toISOString();

    this.connectionOrOpen()
      .db.insert(configOverlays)
      .values({
        path,
        valueJson: JSON.stringify(value),
        updatedAt,
      })
      .onConflictDoUpdate({
        target: configOverlays.path,
        set: {
          valueJson: JSON.stringify(value),
          updatedAt,
        },
      })
      .run();
  }

  async delete(pathExpression: string): Promise<boolean> {
    const path = toStoredPath(pathExpression);
    const result = this.connectionOrOpen().db.delete(configOverlays).where(eq(configOverlays.path, path)).run();
    return result.changes > 0;
  }

  async list(): Promise<ConfigOverlayEntry[]> {
    return this.connectionOrOpen()
      .db.select()
      .from(configOverlays)
      .orderBy(asc(configOverlays.path))
      .all()
      .flatMap((row) => {
        try {
          return [{ path: row.path, value: JSON.parse(row.valueJson) as unknown }];
        } catch (error) {
          this.logger.warn({ path: row.path, error: String(error) }, "failed to hydrate sqlite config overlay row");
          return [];
        }
      });
  }

  async replaceAll(entries: ConfigOverlayEntry[]): Promise<void> {
    const connection = this.connectionOrOpen();
    const updatedAt = new Date().toISOString();
    const values = entries.map((entry) => ({
      path: toStoredPath(entry.path),
      valueJson: JSON.stringify(entry.value),
      updatedAt,
    }));

    connection.sqlite.transaction(() => {
      connection.db.delete(configOverlays).run();
      if (values.length > 0) {
        connection.db.insert(configOverlays).values(values).run();
      }
    })();
  }

  close(): void {
    closeDatabaseConnection({ baseDir: this.baseDir, dbPath: this.options?.dbPath });
    this.connection = null;
  }

  private connectionOrOpen(): SqliteConnection {
    if (!this.connection) {
      this.connection = openDatabaseConnection({ baseDir: this.baseDir, dbPath: this.options?.dbPath });
    }
    return this.connection;
  }
}
