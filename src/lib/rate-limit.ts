/**
 * Small, dependency-free abuse shield for SSR routes and server functions.
 *
 * Uses a fixed-window counter keyed by (bucket, client). It is intentionally
 * process-local: on Cloudflare each isolate enforces its own budget, which is
 * enough to stop single-source floods and accidental runaway clients without a
 * database round trip. For globally exact limits, back this with a KV/Durable
 * Object later — the interface is already async-friendly.
 */
export interface RateLimitRule {
  /** Maximum requests in one window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets (0 when allowed). */
  retryAfter: number;
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const DEFAULT_MAX_KEYS = 20_000;

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(
    private readonly maxKeys = DEFAULT_MAX_KEYS,
    now: () => number = Date.now,
  ) {
    this.now = now;
  }

  /** Consumes one unit from `key`'s budget. Cheap: O(1), no timers. */
  check(key: string, rule: RateLimitRule): RateLimitResult {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + rule.windowMs };
      this.buckets.set(key, bucket);
    }
    // Bound memory. Sweep expired entries when the map grows too large.
    if (this.buckets.size > this.maxKeys) this.sweep(now);

    if (bucket.count >= rule.limit) {
      return {
        allowed: false,
        limit: rule.limit,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        resetAt: bucket.resetAt,
      };
    }
    bucket.count += 1;
    return {
      allowed: true,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - bucket.count),
      retryAfter: 0,
      resetAt: bucket.resetAt,
    };
  }

  private sweep(now: number) {
    for (const [key, value] of this.buckets) {
      if (now >= value.resetAt) this.buckets.delete(key);
    }
    // If everything is still live, drop the oldest half rather than growing.
    if (this.buckets.size > this.maxKeys) {
      let toDrop = this.buckets.size - this.maxKeys;
      for (const key of this.buckets.keys()) {
        if (toDrop-- <= 0) break;
        this.buckets.delete(key);
      }
    }
  }

  /** Test/debug helper. */
  get size(): number {
    return this.buckets.size;
  }
}

/** Shared limiter instance for the whole isolate. */
export const requestLimiter = new RateLimiter();

export const LIMITS = {
  /** Ordinary document / SSR requests. Generous enough for dev HMR. */
  document: { limit: 600, windowMs: 60_000 } satisfies RateLimitRule,
  /** Server functions (DB-backed reads): tighter than static pages. */
  serverFunction: { limit: 240, windowMs: 60_000 } satisfies RateLimitRule,
  /** Sitemap is cheap but DB-backed; crawlers are polite. */
  sitemap: { limit: 120, windowMs: 60_000 } satisfies RateLimitRule,
  /** One signed-URL lookup per thumbnail request. */
  thumbnail: { limit: 180, windowMs: 60_000 } satisfies RateLimitRule,
  /** CSP violation reports are attacker-controllable. */
  cspReport: { limit: 30, windowMs: 60_000 } satisfies RateLimitRule,
} as const;

/**
 * Best-effort client identity. `cf-connecting-ip` is set by Cloudflare and
 * cannot be spoofed by the caller; forwarded headers are only used behind a
 * trusted proxy. Never trust these values for authorisation decisions.
 */
export function clientKeyFromRequest(request: Request): string {
  const headers = request.headers;
  const direct =
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return direct && direct.length <= 128 ? direct : "unknown";
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000))),
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfter) }),
  };
}

export function rateLimitedResponse(result: RateLimitResult): Response {
  return new Response("Too Many Requests", {
    status: 429,
    headers: {
      ...rateLimitHeaders(result),
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Static assets are served by the platform, not our SSR budget. */
export function isStaticAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/@vite/") ||
    pathname.startsWith("/src/") ||
    pathname.startsWith("/node_modules/") ||
    pathname.startsWith("/.well-known/") ||
    // NOTE: .xml/.txt are deliberately absent — /sitemap.xml and /robots.txt
    // are dynamic endpoints that must stay inside the rate-limit budget.
    /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|wasm|json)$/i.test(pathname)
  );
}
