/**
 * Optional globally-exact rate limiter Durable Object.
 *
 * This file intentionally has no `cloudflare:workers` import, so it can be
 * bundled into a worker by Wrangler/Nitro without affecting the Vite build.
 * Add it to the deployment as a second worker (or a named module export) and
 * bind it as `ARINX_RATE_LIMITS_DO`; see `wrangler.example.jsonc`.
 *
 * Each shard is a single-threaded, durable fixed-window counter. Sharding by
 * client key (see `shardFor` in src/lib/rate-limit-backend.ts) spreads load.
 */

interface CounterState {
  count: number;
  resetAt: number;
}

interface DoStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteAll(): Promise<void>;
}

interface DoState {
  storage: DoStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

interface CheckPayload {
  key?: unknown;
  limit?: unknown;
  windowMs?: unknown;
}

const MAX_KEY_LENGTH = 256;

export class ArinXRateLimiterDO {
  private readonly storage: DoStorage;

  constructor(state: DoState) {
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    let payload: CheckPayload;
    try {
      payload = (await request.json()) as CheckPayload;
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    const key = typeof payload.key === "string" ? payload.key.slice(0, MAX_KEY_LENGTH) : "";
    const limit = Number(payload.limit);
    const windowMs = Number(payload.windowMs);
    if (
      !key ||
      !Number.isFinite(limit) ||
      limit <= 0 ||
      !Number.isFinite(windowMs) ||
      windowMs <= 0
    ) {
      return new Response("Bad Request", { status: 400 });
    }

    const now = Date.now();
    const storageKey = `bucket:${key}`;
    const existing = await this.storage.get<CounterState>(storageKey);
    const bucket: CounterState =
      existing && now < existing.resetAt ? existing : { count: 0, resetAt: now + windowMs };

    const allowed = bucket.count < limit;
    if (allowed) {
      bucket.count += 1;
      await this.storage.put(storageKey, bucket);
    }

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return new Response(
      JSON.stringify({
        allowed,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfter: allowed ? 0 : retryAfter,
        resetAt: bucket.resetAt,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
}
