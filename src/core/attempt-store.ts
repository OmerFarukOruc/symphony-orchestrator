import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AttemptEvent, AttemptRecord, SymphonyLogger } from "./types.js";

function sortAttemptsDesc(left: AttemptRecord, right: AttemptRecord): number {
  return right.startedAt.localeCompare(left.startedAt);
}

export class AttemptStore {
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly attemptsByIssue = new Map<string, string[]>();
  private readonly eventsByAttempt = new Map<string, AttemptEvent[]>();

  constructor(
    private readonly baseDir: string,
    private readonly logger: SymphonyLogger,
  ) {}

  async start(): Promise<void> {
    await mkdir(this.attemptsDir(), { recursive: true });
    await mkdir(this.eventsDir(), { recursive: true });

    const entries = await readdir(this.attemptsDir(), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      try {
        const attemptPath = path.join(this.attemptsDir(), entry.name);
        const attempt = JSON.parse(await readFile(attemptPath, "utf8")) as AttemptRecord;
        this.attempts.set(attempt.attemptId, attempt);
        this.indexAttempt(attempt);

        const eventsPath = this.eventsPath(attempt.attemptId);
        try {
          const lines = (await readFile(eventsPath, "utf8"))
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          const events = lines.map((line) => JSON.parse(line) as AttemptEvent);

          // Legacy migration check: Are these events newest-first?
          if (
            events.length > 1 &&
            new Date(events[0].at).getTime() > new Date(events[events.length - 1].at).getTime()
          ) {
            events.reverse();
            // Asynchronously rewrite the archive in chronological order
            const serialized = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
            writeFile(eventsPath, serialized, "utf8").catch((err) => {
              this.logger.warn(
                { attemptId: attempt.attemptId, error: String(err) },
                "failed to migrate legacy archive order",
              );
            });
          }

          this.eventsByAttempt.set(attempt.attemptId, events);
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            this.eventsByAttempt.set(attempt.attemptId, []);
          } else {
            this.logger.warn(
              { attemptId: attempt.attemptId, error: String(error) },
              "attempt event archive corrupt or unreadable",
            );
            this.eventsByAttempt.set(attempt.attemptId, []);
          }
        }
      } catch (error) {
        this.logger.warn({ entry: entry.name, error: String(error) }, "attempt archive entry could not be loaded");
      }
    }
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
    await writeFile(this.eventsPath(attempt.attemptId), "", "utf8");
    await this.persistIssueIndex();
  }

  async updateAttempt(attemptId: string, patch: Partial<AttemptRecord>): Promise<void> {
    const current = this.attempts.get(attemptId);
    if (!current) {
      throw new Error(`unknown attempt id: ${attemptId}`);
    }

    const next = { ...current, ...patch };
    this.attempts.set(attemptId, next);
    await this.reindexAttempt(current, next);
    await this.persistAttempt(next);
  }

  async appendEvent(event: AttemptEvent): Promise<void> {
    const events = this.eventsByAttempt.get(event.attemptId) ?? [];
    events.push(event);
    this.eventsByAttempt.set(event.attemptId, events);
    const serialized = `${JSON.stringify(event)}\n`;
    await appendFile(this.eventsPath(event.attemptId), serialized, "utf8");
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

  private async reindexAttempt(previous: AttemptRecord, next: AttemptRecord): Promise<void> {
    if (previous.issueIdentifier === next.issueIdentifier) {
      return;
    }

    const previousList = this.attemptsByIssue.get(previous.issueIdentifier) ?? [];
    this.attemptsByIssue.set(
      previous.issueIdentifier,
      previousList.filter((attemptId) => attemptId !== previous.attemptId),
    );
    this.indexAttempt(next);
    await this.persistIssueIndex();
  }

  private async persistIssueIndex(): Promise<void> {
    const index: Record<string, string[]> = {};
    for (const [identifier, attemptIds] of this.attemptsByIssue) {
      index[identifier] = [...attemptIds];
    }
    await writeFile(path.join(this.baseDir, "issue-index.json"), JSON.stringify(index, null, 2) + "\n", "utf8");
  }
}
