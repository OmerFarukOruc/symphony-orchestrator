/**
 * Test file for validating the devin-review-loop skill.
 * Contains intentional issues for Devin to find.
 */

// BUG: SQL injection via string concatenation
export function findUserByName(db: unknown, name: string): unknown {
  const query = `SELECT * FROM users WHERE name = '${name}'`;
  return (db as { exec: (q: string) => unknown }).exec(query);
}

// BUG: Promise rejection not handled, no response.ok check
export async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  const data = (await response.json()) as { result: string };
  return data.result;
}

// BUG: Race condition — check-then-act on shared state
let cache: Map<string, string> | null = null;

export function getOrCreateCache(): Map<string, string> {
  if (cache === null) {
    cache = new Map();
  }
  return cache;
}

// BUG: Hardcoded secret
const API_KEY = "sk-live-abc123def456ghi789";

export function makeAuthHeader(): Record<string, string> {
  return { Authorization: `Bearer ${API_KEY}` };
}

// BUG: Unchecked array access
export function getFirst<T>(items: T[]): T {
  return items[0];
}
