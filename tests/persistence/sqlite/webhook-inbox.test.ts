import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../../../src/core/logger.js";
import { closeDatabase, openDatabase, type RisolutoDatabase } from "../../../src/persistence/sqlite/database.js";
import { webhookInbox } from "../../../src/persistence/sqlite/schema.js";
import { SqliteWebhookInbox } from "../../../src/persistence/sqlite/webhook-inbox.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-webhook-inbox-test-"));
  tempDirs.push(dir);
  return dir;
}

function createStore(dir: string): {
  db: RisolutoDatabase;
  inbox: SqliteWebhookInbox;
  close: () => void;
} {
  const dbPath = path.join(dir, "test.db");
  const db = openDatabase(dbPath);
  return {
    db,
    inbox: new SqliteWebhookInbox(db, createLogger()),
    close: () => closeDatabase(db),
  };
}

function createDelivery(
  overrides: Partial<{
    deliveryId: string;
    type: string;
    action: string;
    entityId: string | null;
    issueId: string | null;
    issueIdentifier: string | null;
    webhookTimestamp: number | null;
    payloadJson: string | null;
  }> = {},
): {
  deliveryId: string;
  type: string;
  action: string;
  entityId: string | null;
  issueId: string | null;
  issueIdentifier: string | null;
  webhookTimestamp: number | null;
  payloadJson: string | null;
} {
  return {
    deliveryId: "delivery-1",
    type: "Issue",
    action: "update",
    entityId: "entity-1",
    issueId: "issue-1",
    issueIdentifier: "MT-1",
    webhookTimestamp: 1_774_760_800,
    payloadJson: JSON.stringify({ ok: true, issueId: "issue-1" }),
    ...overrides,
  };
}

function getRow(db: RisolutoDatabase, deliveryId: string) {
  return db.select().from(webhookInbox).where(eq(webhookInbox.deliveryId, deliveryId)).get();
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SqliteWebhookInbox", () => {
  it("inserts verified deliveries once and returns duplicates as not new", async () => {
    const dir = await createTempDir();
    const store = createStore(dir);

    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-01T10:00:00.000Z"));

      const firstDelivery = createDelivery({ deliveryId: "delivery-dedup" });
      const inserted = await store.inbox.insertVerified(firstDelivery);
      const duplicate = await store.inbox.insertVerified(
        createDelivery({
          deliveryId: "delivery-dedup",
          type: "Comment",
          action: "create",
          payloadJson: JSON.stringify({ changed: true }),
        }),
      );

      expect(inserted).toEqual({ isNew: true });
      expect(duplicate).toEqual({ isNew: false });

      const rows = store.db.select().from(webhookInbox).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        deliveryId: "delivery-dedup",
        receivedAt: "2026-04-01T10:00:00.000Z",
        type: "Issue",
        action: "update",
        entityId: "entity-1",
        issueId: "issue-1",
        issueIdentifier: "MT-1",
        webhookTimestamp: 1_774_760_800,
        payloadJson: JSON.stringify({ ok: true, issueId: "issue-1" }),
        status: "received",
        attemptCount: 0,
        nextAttemptAt: null,
        lastError: null,
        appliedAt: null,
      });
    } finally {
      store.close();
    }
  });

  it("transitions deliveries through processing, applied, and ignored states with exact timestamps", async () => {
    const dir = await createTempDir();
    const store = createStore(dir);

    try {
      vi.useFakeTimers();

      vi.setSystemTime(new Date("2026-04-01T10:00:00.000Z"));
      await store.inbox.insertVerified(createDelivery({ deliveryId: "delivery-applied" }));

      await store.inbox.markProcessing("delivery-applied");
      expect(getRow(store.db, "delivery-applied")).toMatchObject({
        deliveryId: "delivery-applied",
        status: "processing",
        attemptCount: 0,
        appliedAt: null,
      });

      vi.setSystemTime(new Date("2026-04-01T10:05:00.000Z"));
      await store.inbox.markApplied("delivery-applied");
      expect(getRow(store.db, "delivery-applied")).toMatchObject({
        deliveryId: "delivery-applied",
        status: "applied",
        appliedAt: "2026-04-01T10:05:00.000Z",
        attemptCount: 0,
      });

      vi.setSystemTime(new Date("2026-04-01T10:10:00.000Z"));
      await store.inbox.insertVerified(createDelivery({ deliveryId: "delivery-ignored" }));
      vi.setSystemTime(new Date("2026-04-01T10:12:00.000Z"));
      await store.inbox.markIgnored("delivery-ignored");

      expect(getRow(store.db, "delivery-ignored")).toMatchObject({
        deliveryId: "delivery-ignored",
        receivedAt: "2026-04-01T10:10:00.000Z",
        status: "ignored",
        appliedAt: "2026-04-01T10:12:00.000Z",
        attemptCount: 0,
      });
    } finally {
      store.close();
    }
  });

  it("marks retries with exact scheduling data and truncates long errors to 500 characters", async () => {
    const dir = await createTempDir();
    const store = createStore(dir);

    try {
      const longError = `${"retry-".repeat(120)}tail`;
      const nextAttemptAt = "2026-04-01T10:15:00.000Z";

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-01T10:00:00.000Z"));
      await store.inbox.insertVerified(createDelivery({ deliveryId: "delivery-retry" }));

      await store.inbox.markForRetry("delivery-retry", longError, 3, nextAttemptAt);

      const row = getRow(store.db, "delivery-retry");
      expect(row).toMatchObject({
        deliveryId: "delivery-retry",
        status: "retry",
        attemptCount: 3,
        nextAttemptAt,
        appliedAt: null,
      });
      expect(row?.lastError).toBe(longError.slice(0, 500));
      expect(row?.lastError).toHaveLength(500);
    } finally {
      store.close();
    }
  });

  it("moves deliveries to dead letter and truncates long errors without resetting retry metadata", async () => {
    const dir = await createTempDir();
    const store = createStore(dir);

    try {
      const retryError = "temporary failure";
      const deadLetterError = `${"dead-letter-".repeat(60)}overflow`;
      const nextAttemptAt = "2026-04-01T10:30:00.000Z";

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-01T10:00:00.000Z"));
      await store.inbox.insertVerified(createDelivery({ deliveryId: "delivery-dead-letter" }));
      await store.inbox.markForRetry("delivery-dead-letter", retryError, 2, nextAttemptAt);
      await store.inbox.markDeadLetter("delivery-dead-letter", deadLetterError);

      const row = getRow(store.db, "delivery-dead-letter");
      expect(row).toMatchObject({
        deliveryId: "delivery-dead-letter",
        status: "dead_letter",
        attemptCount: 2,
        nextAttemptAt,
      });
      expect(row?.lastError).toBe(deadLetterError.slice(0, 500));
      expect(row?.lastError).toHaveLength(500);
    } finally {
      store.close();
    }
  });

  it("fetches only retry deliveries due before now or with no next attempt timestamp", async () => {
    const dir = await createTempDir();
    const store = createStore(dir);

    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-01T10:00:00.000Z"));

      await store.inbox.insertVerified(createDelivery({ deliveryId: "retry-null" }));
      await store.inbox.insertVerified(createDelivery({ deliveryId: "retry-past" }));
      await store.inbox.insertVerified(createDelivery({ deliveryId: "retry-now" }));
      await store.inbox.insertVerified(createDelivery({ deliveryId: "retry-future" }));
      await store.inbox.insertVerified(createDelivery({ deliveryId: "received-past" }));

      store.db
        .update(webhookInbox)
        .set({
          status: "retry",
          attemptCount: 1,
          nextAttemptAt: null,
          lastError: "missing next attempt",
        })
        .where(eq(webhookInbox.deliveryId, "retry-null"))
        .run();

      await store.inbox.markForRetry("retry-past", "past retry", 2, "2026-04-01T09:59:59.000Z");
      await store.inbox.markForRetry("retry-now", "boundary retry", 3, "2026-04-01T10:00:00.000Z");
      await store.inbox.markForRetry("retry-future", "future retry", 4, "2026-04-01T10:00:01.000Z");

      const due = await store.inbox.fetchDueForRetry();
      expect(due.map((delivery) => delivery.deliveryId).sort()).toEqual(["retry-null", "retry-past"]);
      expect(due.map((delivery) => delivery.attemptCount).sort((left, right) => left - right)).toEqual([1, 2]);
      expect(due.every((delivery) => delivery.status === "retry")).toBe(true);
    } finally {
      store.close();
    }
  });

  it("reports exact inbox stats for empty and populated stores", async () => {
    const dir = await createTempDir();
    const store = createStore(dir);

    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-01T10:30:00.000Z"));

      await expect(store.inbox.getStats()).resolves.toEqual({
        backlogCount: 0,
        oldestBacklogAgeSeconds: null,
        dlqCount: 0,
        duplicateCount: 0,
        lastDeliveryAgeSeconds: null,
      });

      vi.setSystemTime(new Date("2026-04-01T10:00:00.000Z"));
      await store.inbox.insertVerified(createDelivery({ deliveryId: "stats-backlog-old" }));

      vi.setSystemTime(new Date("2026-04-01T10:05:00.000Z"));
      await store.inbox.insertVerified(createDelivery({ deliveryId: "stats-deferred-received" }));
      store.db
        .update(webhookInbox)
        .set({ nextAttemptAt: "2026-04-01T10:45:00.000Z" })
        .where(eq(webhookInbox.deliveryId, "stats-deferred-received"))
        .run();

      vi.setSystemTime(new Date("2026-04-01T10:20:00.000Z"));
      await store.inbox.insertVerified(createDelivery({ deliveryId: "stats-dead-letter" }));
      await store.inbox.markDeadLetter("stats-dead-letter", "permanent failure");

      vi.setSystemTime(new Date("2026-04-01T10:30:00.000Z"));
      await expect(store.inbox.getStats()).resolves.toEqual({
        backlogCount: 1,
        oldestBacklogAgeSeconds: 1_800,
        dlqCount: 1,
        duplicateCount: 0,
        lastDeliveryAgeSeconds: 600,
      });
    } finally {
      store.close();
    }
  });

  it("returns recent deliveries in descending received order and enforces both explicit and default limits", async () => {
    const dir = await createTempDir();
    const store = createStore(dir);

    try {
      vi.useFakeTimers();

      for (let index = 1; index <= 21; index += 1) {
        vi.setSystemTime(new Date(`2026-04-01T10:${String(index - 1).padStart(2, "0")}:00.000Z`));
        await store.inbox.insertVerified(
          createDelivery({
            deliveryId: `recent-${index}`,
            issueId: `issue-${index}`,
            issueIdentifier: `MT-${index}`,
            payloadJson: JSON.stringify({ index }),
          }),
        );
      }

      const limited = await store.inbox.getRecent(3);
      expect(limited.map((delivery) => delivery.deliveryId)).toEqual(["recent-21", "recent-20", "recent-19"]);
      expect(limited.map((delivery) => delivery.receivedAt)).toEqual([
        "2026-04-01T10:20:00.000Z",
        "2026-04-01T10:19:00.000Z",
        "2026-04-01T10:18:00.000Z",
      ]);

      const defaultLimited = await store.inbox.getRecent();
      expect(defaultLimited).toHaveLength(20);
      expect(defaultLimited[0].deliveryId).toBe("recent-21");
      expect(defaultLimited[19].deliveryId).toBe("recent-2");
      expect(defaultLimited.some((delivery) => delivery.deliveryId === "recent-1")).toBe(false);
    } finally {
      store.close();
    }
  });
});
