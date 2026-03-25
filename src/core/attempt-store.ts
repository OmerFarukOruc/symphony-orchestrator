import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { asc, eq } from "drizzle-orm";

import type { AttemptEvent, AttemptRecord, SymphonyLogger } from "./types.js";
import { openSymphonyDatabase } from "../persistence/sqlite/database.js";
import { attemptEventRows, attemptRows } from "../persistence/sqlite/schema.js";

function sortAttemptsDesc(left: AttemptRecord, right: AttemptRecord): number {
  return right.startedAt.localeCompare(left.startedAt);
}

export class AttemptStore {
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly attemptsByIssue = new Map<string, string[]>();
  private readonly eventsByAttempt = new Map<string, AttemptEvent[]>();
  private database: ReturnType<typeof openSymphonyDatabase> | null = null;

  constructor(
    private readonly baseDir: string,
    private readonly logger: SymphonyLogger,
  ) {}

  async start(): Promise<void> {
    await mkdir(this.attemptsDir(), { recursive: true });
    await mkdir(this.eventsDir(), { recursive: true });
    this.database = openSymphonyDatabase(this.baseDir);

    await this.loadFromSqlite();
    await this.loadFromFilesystem();
    await this.persistIssueIndex();
  }

  getAttempt(attemptId: string): AttemptRecord | null {
    return this.attempts.get(attemptId) ?? null;
  }

  getAllAttempts(): AttemptRecord[] {
    return [...this.attempts.values()];
  }

  getEvents(attemptId: string): AttemptEvent[] {
    return [...(this.eventsByAttempt.get(attemptId) ?? [])];
  }

  getAttemptsForIssue(issueIdentifier: string): AttemptRecord[] {
    const ids = this.attemptsByIssue.get(issueIdentifier) ?? [];
    return ids
      .map((attemptId) => this.attempts.get(attemptId))
      .filter((attempt): attempt is AttemptRecord => attempt !== undefined)
      .sort(sortAttemptsDesc);
  }

  async createAttempt(attempt: AttemptRecord): Promise<void> {
    this.attempts.set(attempt.attemptId, attempt);
    this.indexAttempt(attempt);
    this.eventsByAttempt.set(attempt.attemptId, []);
    await this.persistAttempt(attempt);
    await this.persistAttemptToDb(attempt);
    await writeFile(this.eventsPath(attempt.attemptId), "", "utf8");
    await this.replaceEventsInDb(attempt.attemptId, []);
    await this.persistIssueIndex();
  }

  async updateAttempt(attemptId: string, patch: Partial<AttemptRecord>): Promise<void> {
    const current = this.attempts.get(attemptId);
    if (!current) {
      throw new Error(`unknown attempt id: ${attemptId}`);
    }

    const next = { ...current, ...patch };
    this.attempts.set(attemptId, next);
    this.reindexAttempt(current, next);
    await this.persistAttempt(next);
    await this.persistAttemptToDb(next);
  }

  async appendEvent(event: AttemptEvent): Promise<void> {
    const events = this.eventsByAttempt.get(event.attemptId) ?? [];
    events.push(event);
    this.eventsByAttempt.set(event.attemptId, events);
    const serialized = `${JSON.stringify(event)}\n`;
    await appendFile(this.eventsPath(event.attemptId), serialized, "utf8");
    await this.persistEventToDb(event, events.length - 1);
  }

  private async persistAttempt(attempt: AttemptRecord): Promise<void> {
    await writeFile(this.attemptPath(attempt.attemptId), `${JSON.stringify(attempt, null, 2)}\n`, "utf8");
  }

  private attemptPath(attemptId: string): string {
    return path.join(this.attemptsDir(), `${attemptId}.json`);
  }

  private eventsPath(attemptId: string): string {
    return path.join(this.eventsDir(), `${attemptId}.jsonl`);
  }

  private attemptsDir(): string {
    return path.join(this.baseDir, "attempts");
  }

  private eventsDir(): string {
    return path.join(this.baseDir, "events");
  }

  private indexAttempt(attempt: AttemptRecord): void {
    const existing = this.attemptsByIssue.get(attempt.issueIdentifier) ?? [];
    if (!existing.includes(attempt.attemptId)) {
      existing.unshift(attempt.attemptId);
      this.attemptsByIssue.set(attempt.issueIdentifier, existing);
    }
  }

  private reindexAttempt(previous: AttemptRecord, next: AttemptRecord): void {
    if (previous.issueIdentifier === next.issueIdentifier) {
      return;
    }

    const previousList = this.attemptsByIssue.get(previous.issueIdentifier) ?? [];
    this.attemptsByIssue.set(
      previous.issueIdentifier,
      previousList.filter((attemptId) => attemptId !== previous.attemptId),
    );
    this.indexAttempt(next);
    void this.persistIssueIndex();
  }

  private async persistIssueIndex(): Promise<void> {
    const index: Record<string, string[]> = {};
    for (const [identifier, attemptIds] of this.attemptsByIssue) {
      index[identifier] = [...attemptIds];
    }
    await writeFile(path.join(this.baseDir, "issue-index.json"), JSON.stringify(index, null, 2) + "\n", "utf8");
  }

  private async loadFromSqlite(): Promise<void> {
    if (!this.database) {
      return;
    }

    const sqliteAttempts = await this.database.db.select().from(attemptRows);
    for (const row of sqliteAttempts) {
      try {
        const attempt = JSON.parse(row.payload) as AttemptRecord;
        this.attempts.set(attempt.attemptId, attempt);
        this.indexAttempt(attempt);
      } catch (error) {
        this.logger.warn(
          { attemptId: row.attemptId, error: String(error) },
          "corrupted attempt row in SQLite, skipping",
        );
      }
    }

    const sqliteEvents = await this.database.db
      .select()
      .from(attemptEventRows)
      .orderBy(asc(attemptEventRows.attemptId), asc(attemptEventRows.position));
    for (const row of sqliteEvents) {
      try {
        const event = JSON.parse(row.payload) as AttemptEvent;
        const events = this.eventsByAttempt.get(row.attemptId) ?? [];
        events.push(event);
        this.eventsByAttempt.set(row.attemptId, events);
      } catch (error) {
        this.logger.warn({ attemptId: row.attemptId, error: String(error) }, "corrupted event row in SQLite, skipping");
      }
    }
  }

  private async loadFromFilesystem(): Promise<void> {
    const entries = await readdir(this.attemptsDir(), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      try {
        await this.loadAttemptArchive(entry.name);
      } catch (error) {
        this.logger.warn({ entry: entry.name, error: String(error) }, "attempt archive entry could not be loaded");
      }
    }
  }

  private async loadAttemptArchive(fileName: string): Promise<void> {
    const attemptPath = path.join(this.attemptsDir(), fileName);
    const attempt = JSON.parse(await readFile(attemptPath, "utf8")) as AttemptRecord;
    this.attempts.set(attempt.attemptId, attempt);
    this.indexAttempt(attempt);
    await this.persistAttemptToDb(attempt);

    try {
      const events = await this.loadEventArchive(attempt.attemptId);
      this.eventsByAttempt.set(attempt.attemptId, events);
      await this.replaceEventsInDb(attempt.attemptId, events);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        this.eventsByAttempt.set(attempt.attemptId, []);
        await this.replaceEventsInDb(attempt.attemptId, []);
        return;
      }
      this.logger.warn(
        { attemptId: attempt.attemptId, error: String(error) },
        "attempt event archive corrupt or unreadable",
      );
      this.eventsByAttempt.set(attempt.attemptId, []);
      await this.replaceEventsInDb(attempt.attemptId, []);
    }
  }

  private async loadEventArchive(attemptId: string): Promise<AttemptEvent[]> {
    const eventsPath = this.eventsPath(attemptId);
    const lines = (await readFile(eventsPath, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const events = lines.map((line) => JSON.parse(line) as AttemptEvent);

    if (events.length > 1 && new Date(events[0].at).getTime() > new Date(events[events.length - 1].at).getTime()) {
      events.reverse();
      const serialized = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
      writeFile(eventsPath, serialized, "utf8").catch((error) => {
        this.logger.warn({ attemptId, error: String(error) }, "failed to migrate legacy archive order");
      });
    }

    return events;
  }

  private async persistAttemptToDb(attempt: AttemptRecord): Promise<void> {
    if (!this.database) {
      return;
    }
    await this.database.db
      .insert(attemptRows)
      .values({
        attemptId: attempt.attemptId,
        issueIdentifier: attempt.issueIdentifier,
        startedAt: attempt.startedAt,
        payload: JSON.stringify(attempt),
      })
      .onConflictDoUpdate({
        target: attemptRows.attemptId,
        set: {
          issueIdentifier: attempt.issueIdentifier,
          startedAt: attempt.startedAt,
          payload: JSON.stringify(attempt),
        },
      });
  }

  private async replaceEventsInDb(attemptId: string, events: AttemptEvent[]): Promise<void> {
    if (!this.database) {
      return;
    }
    this.database.db.transaction((tx) => {
      tx.delete(attemptEventRows).where(eq(attemptEventRows.attemptId, attemptId)).run();
      if (events.length === 0) {
        return;
      }
      tx.insert(attemptEventRows)
        .values(
          events.map((event, index) => ({
            attemptId,
            position: index,
            payload: JSON.stringify(event),
          })),
        )
        .run();
    });
  }

  private async persistEventToDb(event: AttemptEvent, position: number): Promise<void> {
    if (!this.database) {
      return;
    }
    await this.database.db.insert(attemptEventRows).values({
      attemptId: event.attemptId,
      position,
      payload: JSON.stringify(event),
    });
  }
}
