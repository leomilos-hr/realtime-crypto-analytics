/**
 * Simple in-memory rate limiter for API routes.
 * Uses a sliding window approach per IP address.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  windows.forEach((entry, key) => {
    if (now > entry.resetAt) windows.delete(key);
  });
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given key (usually IP + route).
 * Returns { allowed, remaining, resetAt }.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    const resetAt = now + config.windowSec * 1000;
    windows.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.limit - 1, resetAt };
  }

  if (entry.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Extract client IP from request headers.
 * Works behind proxies (X-Forwarded-For) and in direct connections.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
