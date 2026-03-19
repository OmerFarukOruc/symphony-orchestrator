import type { RequestHandler } from "express";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;

export function createRateLimiter(options: RateLimitOptions = {}): RequestHandler {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const buckets = new Map<string, TokenBucket>();

  function refillBucket(bucket: TokenBucket, now: number): void {
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= windowMs) {
      bucket.tokens = maxRequests;
      bucket.lastRefill = now;
    }
  }

  return (req, res, next) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    let bucket = buckets.get(ip);
    if (!bucket) {
      bucket = { tokens: maxRequests, lastRefill: now };
      buckets.set(ip, bucket);
    }
    refillBucket(bucket, now);
    if (bucket.tokens <= 0) {
      res.status(429).json({ error: { code: "rate_limited", message: "Too many requests" } });
      return;
    }
    bucket.tokens -= 1;
    next();
  };
}
