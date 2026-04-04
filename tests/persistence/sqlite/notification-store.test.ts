import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeDatabase, openDatabase, type RisolutoDatabase } from "../../../src/persistence/sqlite/database.js";
import { NotificationStore } from "../../../src/persistence/sqlite/notification-store.js";
import { notifications } from "../../../src/persistence/sqlite/schema.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-notification-store-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function createSqliteStore(dir: string): {
  db: RisolutoDatabase;
  store: ReturnType<typeof NotificationStore.create>;
  close: () => void;
} {
  const db = openDatabase(path.join(dir, "test.db"));
  return {
    db,
    store: NotificationStore.create(db),
    close: () => closeDatabase(db),
  };
}

describe("NotificationStore", () => {
  it("creates persisted notifications and lists them newest-first", async () => {
    const dir = await createTempDir();
    const { db, store, close } = createSqliteStore(dir);

    try {
      await store.create({
        type: "worker_completed",
        severity: "info",
        title: "Worker completed",
        message: "MT-1 finished cleanly",
        source: "MT-1",
        href: "https://linear.app/example/MT-1",
        dedupeKey: "mt-1-complete",
        metadata: { issueIdentifier: "MT-1" },
        createdAt: "2026-04-04T09:00:00.000Z",
      });
      const newer = await store.create({
        type: "worker_failed",
        severity: "critical",
        title: "Worker failed",
        message: "MT-2 crashed",
        source: "MT-2",
        href: null,
        dedupeKey: "mt-2-failed",
        metadata: { issueIdentifier: "MT-2" },
        createdAt: "2026-04-04T09:05:00.000Z",
      });

      const listed = await store.list();
      expect(listed.map((notification) => notification.id)).toEqual([newer.id, expect.any(String)]);
      expect(await store.countAll()).toBe(2);
      expect(await store.countUnread()).toBe(2);

      const rows = db.select().from(notifications).where(eq(notifications.id, newer.id)).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: newer.id,
        severity: "critical",
        read: false,
        source: "MT-2",
      });
    } finally {
      close();
    }
  });

  it("updates delivery summary and read state in SQLite", async () => {
    const dir = await createTempDir();
    const { db, store, close } = createSqliteStore(dir);

    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-04T09:10:00.000Z"));
      const created = await store.create({
        type: "worker_retry",
        severity: "warning",
        title: "Retry queued",
        message: "MT-9 will retry",
        source: "MT-9",
        href: null,
        dedupeKey: "mt-9-retry",
        metadata: { attempt: 2 },
        createdAt: "2026-04-04T09:10:00.000Z",
      });

      vi.setSystemTime(new Date("2026-04-04T09:12:00.000Z"));
      const updated = await store.updateDeliverySummary(created.id, {
        deliveredChannels: ["slack"],
        failedChannels: [{ channel: "desktop", error: "permission denied" }],
        skippedDuplicate: false,
      });
      expect(updated).toMatchObject({
        id: created.id,
        deliverySummary: {
          deliveredChannels: ["slack"],
          failedChannels: [{ channel: "desktop", error: "permission denied" }],
          skippedDuplicate: false,
        },
        updatedAt: "2026-04-04T09:12:00.000Z",
      });

      vi.setSystemTime(new Date("2026-04-04T09:15:00.000Z"));
      const read = await store.markRead(created.id);
      expect(read?.read).toBe(true);
      expect(read?.updatedAt).toBe("2026-04-04T09:15:00.000Z");

      const row = db.select().from(notifications).where(eq(notifications.id, created.id)).get();
      expect(row).toMatchObject({
        read: true,
      });
    } finally {
      close();
    }
  });

  it("marks every unread notification as read and reports the updated count", async () => {
    const dir = await createTempDir();
    const { store, close } = createSqliteStore(dir);

    try {
      await store.create({
        type: "worker_completed",
        severity: "info",
        title: "One",
        message: "First",
        source: "MT-1",
        href: null,
        dedupeKey: "1",
        metadata: null,
        createdAt: "2026-04-04T09:00:00.000Z",
      });
      const second = await store.create({
        type: "worker_failed",
        severity: "critical",
        title: "Two",
        message: "Second",
        source: "MT-2",
        href: null,
        dedupeKey: "2",
        metadata: null,
        createdAt: "2026-04-04T09:05:00.000Z",
      });
      await store.markRead(second.id);

      const result = await store.markAllRead();
      expect(result).toEqual({ updatedCount: 1, unreadCount: 0 });
      expect(await store.countUnread()).toBe(0);
    } finally {
      close();
    }
  });

  it("falls back to an in-memory store when SQLite is disabled", async () => {
    const store = NotificationStore.create(null);

    const created = await store.create({
      type: "worker_completed",
      severity: "info",
      title: "Memory notification",
      message: "Fallback works",
      source: "MT-3",
      href: null,
      dedupeKey: "memory-1",
      metadata: { issueIdentifier: "MT-3" },
      createdAt: "2026-04-04T10:00:00.000Z",
    });

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(created);
    expect(await store.countUnread()).toBe(1);
  });
});
