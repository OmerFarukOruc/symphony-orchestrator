import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchData,
  findUserByName,
  getFirst,
  getOrCreateCache,
  makeAuthHeader,
} from "./fixtures/test-review-target.js";

describe("test-review-target", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("findUserByName", () => {
    it("passes name as a parameterized value, not interpolated SQL", () => {
      const db = { exec: vi.fn().mockReturnValue([{ id: 1, name: "Alice" }]) };
      findUserByName(db, "Alice");
      expect(db.exec).toHaveBeenCalledWith("SELECT * FROM users WHERE name = ?", ["Alice"]);
    });

    it("does not embed user input in the query string", () => {
      const db = { exec: vi.fn() };
      findUserByName(db, "'; DROP TABLE users; --");
      const [query] = db.exec.mock.calls[0] as [string, unknown[]];
      expect(query).not.toContain("DROP TABLE");
    });
  });

  describe("fetchData", () => {
    it("returns result on 200 OK", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ result: "hello" }),
      } as Response);
      await expect(fetchData("https://example.com")).resolves.toBe("hello");
    });

    it("throws on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);
      await expect(fetchData("https://example.com")).rejects.toThrow("HTTP 404: Not Found");
    });
  });

  describe("getOrCreateCache", () => {
    it("returns a new map when called with null", () => {
      const cache = getOrCreateCache(null);
      expect(cache).toBeInstanceOf(Map);
      expect(cache.size).toBe(0);
    });

    it("returns a new map when called with no arguments", () => {
      const cache = getOrCreateCache();
      expect(cache).toBeInstanceOf(Map);
    });

    it("returns the existing map when provided", () => {
      const existing = new Map([["key", "value"]]);
      const cache = getOrCreateCache(existing);
      expect(cache).toBe(existing);
    });
  });

  describe("makeAuthHeader", () => {
    it("reads API_KEY from environment", () => {
      vi.stubEnv("API_KEY", "test-key-123");
      const header = makeAuthHeader();
      expect(header).toEqual({ Authorization: "Bearer test-key-123" });
    });

    it("throws when API_KEY is not set", () => {
      vi.stubEnv("API_KEY", "");
      expect(() => makeAuthHeader()).toThrow("API_KEY environment variable is not set");
    });
  });

  describe("getFirst", () => {
    it("returns the first element", () => {
      expect(getFirst([1, 2, 3])).toBe(1);
    });

    it("returns undefined for an empty array", () => {
      expect(getFirst([])).toBeUndefined();
    });
  });
});
