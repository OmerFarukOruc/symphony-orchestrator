import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { sortAttemptsDesc, sumAttemptDurationSeconds } from "./attempt-store-port.js";
import { computeAttemptCostUsd } from "./model-pricing.js";
import type { AttemptEvent, AttemptRecord, RisolutoLogger } from "./types.js";
import { toErrorString } from "../utils/type-guards.js";

export class AttemptStore {
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly attemptsByIssue = new Map<string, string[]>();
  private readonly eventsByAttempt = new Map<string, AttemptEvent[]>();
  private archivedSeconds = 0;
  private archivedCostUsd = 0;
  private archivedTokenTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  constructor(
    private readonly baseDir: string,
    private readonly logger: RisolutoLogger,
  ) {}

  async start(): Promise<void> {
    await mkdir(this.attemptsDir(), { recursive: true });
    await mkdir(this.eventsDir(), { recursive: true });
    this.attempts.clear();
    this.attemptsByIssue.clear();
    this.eventsByAttempt.clear();
    this.resetAggregates();

    const entries = await readdir(this.attemptsDir(), { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => this.loadAttemptFromDisk(entry.name)),
    );
    this.sortIssueIndexes();
    await this.persistIssueIndex();
  }

  private async loadAttemptFromDisk(fileName: string): Promise<void> {
    try {
      const attemptPath = path.join(this.attemptsDir(), fileName);
      const attempt = JSON.parse(await readFile(attemptPath, "utf8")) as AttemptRecord;
      this.attempts.set(attempt.attemptId, attempt);
      this.indexAttempt(attempt);
      this.applyAttemptAggregates(attempt, 1);

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
      return this.migrateEventOrder(attemptId, events, eventsPath);
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
   * Returns the corrected array (reversed copy) if migration is needed,
   * otherwise returns the original. Asynchronously rewrites the archive file.
   */
  private migrateEventOrder(attemptId: string, events: AttemptEvent[], eventsPath: string): AttemptEvent[] {
    if (events.length > 1 && new Date(events[0].at).getTime() > new Date(events.at(-1)!.at).getTime()) {
      const corrected = [...events].reverse();
      const serialized = corrected.map((e) => JSON.stringify(e)).join("\n") + "\n";
      writeFile(eventsPath, serialized, "utf8").catch((error: unknown) => {
        this.logger.warn({ attemptId, error: toErrorString(error) }, "failed to migrate legacy archive order");
      });
      return corrected;
    }
    return events;
  }

  getAttempt(attemptId: string): AttemptRecord | null {
    return this.attempts.get(attemptId) ?? null;
  }

  getAllAttempts(): AttemptRecord[] {
    return [...this.attempts.values()];
  }

  sumArchivedSeconds(): number {
    return this.archivedSeconds;
  }

  sumCostUsd(): number {
    return this.archivedCostUsd;
  }

  sumArchivedTokens(): { inputTokens: number; outputTokens: number; totalTokens: number } {
    return { ...this.archivedTokenTotals };
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
    const existing = this.attempts.get(attempt.attemptId);
    if (existing) {
      this.applyAttemptAggregates(existing, -1);
    }
    this.attempts.set(attempt.attemptId, attempt);
    this.indexAttempt(attempt);
    this.eventsByAttempt.set(attempt.attemptId, []);
    this.applyAttemptAggregates(attempt, 1);
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
    this.applyAttemptAggregates(current, -1);
    this.attempts.set(attemptId, next);
    this.applyAttemptAggregates(next, 1);
    await this.reindexAttempt(current, next);
    await this.persistAttempt(next);
  }

  async appendEvent(event: AttemptEvent): Promise<void> {
    const existing = this.eventsByAttempt.get(event.attemptId) ?? [];
    this.eventsByAttempt.set(event.attemptId, [...existing, event]);
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

  /** Re-sort every issue index after parallel disk load to ensure deterministic order. */
  private sortIssueIndexes(): void {
    for (const [identifier, ids] of this.attemptsByIssue) {
      const sorted = ids
        .map((id) => this.attempts.get(id))
        .filter((a): a is AttemptRecord => a !== undefined)
        .sort(sortAttemptsDesc)
        .map((a) => a.attemptId);
      this.attemptsByIssue.set(identifier, sorted);
    }
  }

  private indexAttempt(attempt: AttemptRecord): void {
    const existing = this.attemptsByIssue.get(attempt.issueIdentifier) ?? [];
    if (!existing.includes(attempt.attemptId)) {
      this.attemptsByIssue.set(attempt.issueIdentifier, [attempt.attemptId, ...existing]);
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

  private resetAggregates(): void {
    this.archivedSeconds = 0;
    this.archivedCostUsd = 0;
    this.archivedTokenTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  private applyAttemptAggregates(attempt: AttemptRecord, direction: 1 | -1): void {
    this.archivedSeconds += direction * sumAttemptDurationSeconds([attempt]);
    if (!attempt.tokenUsage) {
      return;
    }

    this.archivedTokenTotals = {
      inputTokens: this.archivedTokenTotals.inputTokens + direction * attempt.tokenUsage.inputTokens,
      outputTokens: this.archivedTokenTotals.outputTokens + direction * attempt.tokenUsage.outputTokens,
      totalTokens: this.archivedTokenTotals.totalTokens + direction * attempt.tokenUsage.totalTokens,
    };

    const cost = computeAttemptCostUsd(attempt);
    if (cost !== null) {
      this.archivedCostUsd += direction * cost;
    }
  }
}
