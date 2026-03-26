import type { AttemptEvent, AttemptRecord, AttemptStore, SymphonyLogger } from "@symphony/shared";

import { FileAttemptStore } from "./attempt-store.js";
import { normalizeForComparison, readAttemptStoreWithFallback, valuesMatch } from "./dual-write-store-helpers.js";
import { AttemptStoreSqlite } from "../db/attempt-store-sqlite.js";

type StartableAttemptStore = AttemptStore & {
  start?: () => Promise<void>;
};

interface DualWriteAttemptStoreOptions {
  fileStore?: StartableAttemptStore;
  sqliteStore?: StartableAttemptStore;
}

export class DualWriteAttemptStore implements AttemptStore {
  private readonly fileStore: StartableAttemptStore;
  private readonly sqliteStore: StartableAttemptStore;

  constructor(
    baseDir: string,
    private readonly logger: SymphonyLogger,
    options: DualWriteAttemptStoreOptions = {},
  ) {
    this.fileStore = options.fileStore ?? new FileAttemptStore(baseDir, logger.child({ backend: "file" }));
    this.sqliteStore = options.sqliteStore ?? new AttemptStoreSqlite(baseDir, logger.child({ backend: "sqlite" }));
  }

  async start(): Promise<void> {
    await this.fileStore.start?.();
    await this.sqliteStore.start?.();
  }

  getAttempt(attemptId: string): AttemptRecord | null {
    return readAttemptStoreWithFallback(
      this.logger,
      "getAttempt",
      this.fileStore,
      this.sqliteStore,
      (store) => store.getAttempt(attemptId),
      (value) => value === null,
    );
  }

  getAllAttempts(): AttemptRecord[] {
    return readAttemptStoreWithFallback(
      this.logger,
      "getAllAttempts",
      this.fileStore,
      this.sqliteStore,
      (store) => store.getAllAttempts(),
      (value) => value.length === 0,
    );
  }

  getEvents(attemptId: string): AttemptEvent[] {
    return readAttemptStoreWithFallback(
      this.logger,
      "getEvents",
      this.fileStore,
      this.sqliteStore,
      (store) => store.getEvents(attemptId),
      (value) => value.length === 0,
    );
  }

  getAttemptsForIssue(issueIdentifier: string): AttemptRecord[] {
    return readAttemptStoreWithFallback(
      this.logger,
      "getAttemptsForIssue",
      this.fileStore,
      this.sqliteStore,
      (store) => store.getAttemptsForIssue(issueIdentifier),
      (value) => value.length === 0,
    );
  }

  async createAttempt(attempt: AttemptRecord): Promise<void> {
    await this.fileStore.createAttempt(attempt);
    await this.sqliteStore.createAttempt(attempt);
    this.verifyAttemptSnapshot(attempt.attemptId, attempt.issueIdentifier, "createAttempt");
    this.verifyEventsSnapshot(attempt.attemptId, "createAttempt");
  }

  async updateAttempt(attemptId: string, patch: Partial<AttemptRecord>): Promise<void> {
    await this.fileStore.updateAttempt(attemptId, patch);
    await this.sqliteStore.updateAttempt(attemptId, patch);

    const nextAttempt = this.fileStore.getAttempt(attemptId);
    if (!nextAttempt) {
      throw new Error(`unknown attempt id after file update: ${attemptId}`);
    }

    this.verifyAttemptSnapshot(attemptId, nextAttempt.issueIdentifier, "updateAttempt");
    this.verifyEventsSnapshot(attemptId, "updateAttempt");
  }

  async appendEvent(event: AttemptEvent): Promise<void> {
    await this.fileStore.appendEvent(event);
    await this.sqliteStore.appendEvent(event);
    this.verifyEventsSnapshot(event.attemptId, "appendEvent");
  }

  private verifyAttemptSnapshot(attemptId: string, issueIdentifier: string, operation: string): void {
    this.warnOnMismatch(operation, "attempt", attemptId, {
      issueIdentifier,
      fileValue: this.fileStore.getAttempt(attemptId),
      sqliteValue: this.sqliteStore.getAttempt(attemptId),
    });
    this.warnOnMismatch(operation, "issue_attempts", attemptId, {
      issueIdentifier,
      fileValue: this.fileStore.getAttemptsForIssue(issueIdentifier),
      sqliteValue: this.sqliteStore.getAttemptsForIssue(issueIdentifier),
    });
  }

  private verifyEventsSnapshot(attemptId: string, operation: string): void {
    this.warnOnMismatch(operation, "events", attemptId, {
      fileValue: this.fileStore.getEvents(attemptId),
      sqliteValue: this.sqliteStore.getEvents(attemptId),
    });
  }

  private warnOnMismatch(
    operation: string,
    scope: string,
    attemptId: string,
    values: {
      issueIdentifier?: string;
      fileValue: unknown;
      sqliteValue: unknown;
    },
  ): void {
    if (valuesMatch(values.fileValue, values.sqliteValue)) {
      return;
    }

    const normalizedFileValue = normalizeForComparison(values.fileValue);
    const normalizedSqliteValue = normalizeForComparison(values.sqliteValue);

    this.logger.warn(
      {
        operation,
        scope,
        attemptId,
        issueIdentifier: values.issueIdentifier,
        fileValue: normalizedFileValue,
        sqliteValue: normalizedSqliteValue,
      },
      "dual-write verification mismatch detected",
    );
  }
}
