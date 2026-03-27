import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { sortAttemptsDesc, sumAttemptDurationSeconds } from "./attempt-store-port.js";
import { lookupModelPrice } from "./model-pricing.js";
import type { AttemptEvent, AttemptRecord, SymphonyLogger } from "./types.js";
import { toErrorString } from "../utils/type-guards.js";

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
      await this.loadAttemptFromDisk(entry.name);
    }
    await this.persistIssueIndex();
  }

  private async loadAttemptFromDisk(fileName: string): Promise<void> {
    try {
      const attemptPath = path.join(this.attemptsDir(), fileName);
      const attempt = JSON.parse(await readFile(attemptPath, "utf8")) as AttemptRecord;
      this.attempts.set(attempt.attemptId, attempt);
      this.indexAttempt(attempt);

      const events = await this.loadAttemptEvents(attempt.attemptId);
      this.eventsByAttempt.set(attempt.attemptId, events);
    } catch (error) {
      this.logger.warn({ entry: fileName, error: toErrorString(error) }, "attempt archive entry could not be loaded");
    }
  }

  private async loadAttemptEvents(attemptId: string): Promise<AttemptEvent[]> {
    const eventsPath = this.eventsPath(attemptId);
    try {
      const lines = (await readFile(eventsPath, "utf8"))
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const events = lines.map((line) => JSON.parse(line) as AttemptEvent);
      this.migrateEventOrder(attemptId, events, eventsPath);
      return events;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }
      this.logger.warn({ attemptId, error: toErrorString(error) }, "attempt event archive corrupt or unreadable");
      return [];
    }
  }

  /**
   * Legacy migration: reorder events from newest-first to chronological order.
   * Asynchronously rewrites the archive file without blocking startup.
   */
  private migrateEventOrder(attemptId: string, events: AttemptEvent[], eventsPath: string): void {
    if (events.length > 1 && new Date(events[0].at).getTime() > new Date(events.at(-1)!.at).getTime()) {
      events.reverse();
      const serialized = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
      writeFile(eventsPath, serialized, "utf8").catch((error: unknown) => {
        this.logger.warn({ attemptId, error: toErrorString(error) }, "failed to migrate legacy archive order");
      });
    }
  }

  getAttempt(attemptId: string): AttemptRecord | null {
    return this.attempts.get(attemptId) ?? null;
  }

  getAllAttempts(): AttemptRecord[] {
    return [...this.attempts.values()];
  }

  sumArchivedSeconds(): number {
    return sumAttemptDurationSeconds(this.attempts.values());
  }

  sumCostUsd(): number {
    let total = 0;
    for (const attempt of this.attempts.values()) {
      if (!attempt.tokenUsage) continue;
      const price = lookupModelPrice(attempt.model);
      if (!price) continue;
      total +=
        (attempt.tokenUsage.inputTokens * price.inputUsd + attempt.tokenUsage.outputTokens * price.outputUsd) /
        1_000_000;
    }
    return total;
  }

  sumArchivedTokens(): { inputTokens: number; outputTokens: number; totalTokens: number } {
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    for (const attempt of this.attempts.values()) {
      if (!attempt.tokenUsage) continue;
      inputTokens += attempt.tokenUsage.inputTokens;
      outputTokens += attempt.tokenUsage.outputTokens;
      totalTokens += attempt.tokenUsage.totalTokens;
    }
    return { inputTokens, outputTokens, totalTokens };
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
