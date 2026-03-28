import type { RecentEvent } from "../types.js";

export type SortDirection = "desc" | "asc";

export interface LogBuffer {
  events(): RecentEvent[];
  insert(event: RecentEvent): boolean;
  load(events: RecentEvent[]): void;
  clear(): void;
  setDirection(direction: SortDirection): void;
  direction(): SortDirection;
  size(): number;
}

function dedupKey(event: RecentEvent): string {
  return `${event.at}|${event.event}|${event.message}|${event.session_id ?? ""}`;
}

function compareAsc(a: RecentEvent, b: RecentEvent): number {
  if (a.at < b.at) return -1;
  if (a.at > b.at) return 1;
  return 0;
}

function compareDesc(a: RecentEvent, b: RecentEvent): number {
  if (a.at > b.at) return -1;
  if (a.at < b.at) return 1;
  return 0;
}

function compareFn(dir: SortDirection): (a: RecentEvent, b: RecentEvent) => number {
  return dir === "desc" ? compareDesc : compareAsc;
}

/**
 * Find the insertion index for `event` in the already-sorted `items` array
 * using binary search. The returned index satisfies: all elements before it
 * compare <= 0 against `event` according to `cmp`.
 */
function binarySearchIndex(
  items: RecentEvent[],
  event: RecentEvent,
  cmp: (a: RecentEvent, b: RecentEvent) => number,
): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (cmp(items[mid]!, event) <= 0) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/**
 * Create a sorted, deduplicated event buffer with binary search insert.
 *
 * Events are deduplicated by a composite key of `at`, `event`, `message`,
 * and `session_id`. The buffer maintains sorted order by timestamp, with
 * configurable direction (newest-first by default).
 */
export function createLogBuffer(initialDirection: SortDirection = "desc"): LogBuffer {
  const items: RecentEvent[] = [];
  const seen = new Set<string>();
  let currentDirection: SortDirection = initialDirection;

  return {
    events(): RecentEvent[] {
      return items;
    },

    insert(event: RecentEvent): boolean {
      const key = dedupKey(event);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);

      const cmp = compareFn(currentDirection);
      const idx = binarySearchIndex(items, event, cmp);
      items.splice(idx, 0, event);
      return true;
    },

    load(events: RecentEvent[]): void {
      let added = false;
      for (const event of events) {
        const key = dedupKey(event);
        if (!seen.has(key)) {
          seen.add(key);
          items.push(event);
          added = true;
        }
      }
      if (added) {
        items.sort(compareFn(currentDirection));
      }
    },

    clear(): void {
      items.length = 0;
      seen.clear();
    },

    setDirection(direction: SortDirection): void {
      if (direction === currentDirection) {
        return;
      }
      currentDirection = direction;
      items.sort(compareFn(currentDirection));
    },

    direction(): SortDirection {
      return currentDirection;
    },

    size(): number {
      return items.length;
    },
  };
}
