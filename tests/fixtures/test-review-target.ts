/**
 * Test file for validating the devin-review-loop skill.
 * Demonstrates patterns for secure coding practices.
 */

interface Database {
  exec: (query: string, params: unknown[]) => unknown;
}

/** Finds a user by name using parameterized queries. */
export function findUserByName(db: Database, name: string): unknown {
  return db.exec("SELECT * FROM users WHERE name = ?", [name]);
}

/** Fetches JSON data from a URL with proper error handling. */
export async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)}: ${response.statusText}`);
  }
  const data = (await response.json()) as { result: string };
  return data.result;
}

/** Creates or returns an existing cache — no module-level mutable state. */
export function getOrCreateCache(existing: Map<string, string> | null = null): Map<string, string> {
  return existing ?? new Map();
}

/** Builds an auth header from the API_KEY environment variable. */
export function makeAuthHeader(): Record<string, string> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY environment variable is not set");
  }
  return { Authorization: `Bearer ${apiKey}` };
}

/** Returns the first element, or undefined if the array is empty. */
export function getFirst<T>(items: T[]): T | undefined {
  return items[0];
}
