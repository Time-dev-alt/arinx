/**
 * Pluggable abuse shield. Every call site uses `checkRateLimit()`; the backend
 * is selected once per request from the platform bindings.
 *
 * Priority (most exact first):
 *  1. Cloudflare Workers Rate Limiting binding  — globally exact, no custom code
 *  2. Durable Object stub                       — globally exact, serialised
 *  3. KV namespace                             — near-exact (eventual writes)
 *  4. process-local fixed window               — always available fallback
 *
 * Nothing here requires a binding to be present: adding one to the Wrangler
 * config upgrades the whole platform from isolate-local to globally exact
 * without touching a call site.
 */
import {
  LIMITS,
  RateLimiter,
  requestLimiter,
  type RateLimitResult,
  type RateLimitRule,
} from "@/lib/rate-limit";

export interface RateLimitBackend {
  readonly name: string;
  check(key: string, rule: RateLimitRule): Promise<RateLimitResult> | RateLimitResult;
}

/** Cloudflare Workers Rate Limiting binding (`type: "ratelimit"`). */
export interface WorkersRateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** A Durable Object namespace + stub from `env.ARINX_RATE_LIMITS_DO`. */
export interface DurableObjectBinding {
  idFromName(name: string): {
    fetch(input: string | Request, init?: RequestInit): Promise<Response>;
  };
}

export interface KvBinding {
  get(key: string, options?: { type?: "text" | "json" }): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface RateLimitBindings {
  ARINX_RATE_LIMITER?: WorkersRateLimiterBinding;
  ARINX_RATE_LIMITS_DO?: DurableObjectBinding;
  ARINX_RATE_LIMITS_KV?: KvBinding;
  [key: string]: unknown;
}

function resultFrom(
  allowed: boolean,
  rule: RateLimitRule,
  remaining: number,
  retryAfter = 0,
  now = Date.now(),
): RateLimitResult {
  return {
    allowed,
    limit: rule.limit,
    remaining,
    retryAfter: allowed ? 0 : retryAfter,
    resetAt: now + (allowed ? rule.windowMs : retryAfter * 1000),
  };
}

export class LocalRateLimitBackend implements RateLimitBackend {
  readonly name = "local";
  constructor(private readonly limiter: RateLimiter = requestLimiter) {}
  check(key: string, rule: RateLimitRule): RateLimitResult {
    return this.limiter.check(key, rule);
  }
}

/** Cloudflare's native rate limiting API. Atomic across every isolate. */
export class WorkersRateLimitBackend implements RateLimitBackend {
  readonly name = "cloudflare-ratelimit";
  constructor(private readonly binding: WorkersRateLimiterBinding) {}
  async check(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const { success } = await this.binding.limit({ key });
    // The binding owns the quota window; expose the configured rule in headers.
    return resultFrom(success, rule, success ? Math.max(0, rule.limit - 1) : 0, success ? 0 : 60);
  }
}

/** Cheap FNV-1a sharding keeps one Durable Object from becoming a bottleneck. */
export function shardFor(key: string, shards = 64): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `arinx-ratelimit-shard-${(hash >>> 0) % shards}`;
}

export class DurableObjectRateLimitBackend implements RateLimitBackend {
  readonly name = "durable-object";
  constructor(private readonly binding: DurableObjectBinding) {}
  async check(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const stub = this.binding.idFromName(shardFor(key));
    const response = await stub.fetch("https://arinx.internal/rate-limit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, limit: rule.limit, windowMs: rule.windowMs }),
    });
    if (!response.ok) throw new Error(`Rate limiter DO returned ${response.status}`);
    return (await response.json()) as RateLimitResult;
  }
}

/**
 * KV is not atomic, but a per-(key, window) bucket with TTL keeps races rare
 * and bounded. Use the Durable Object binding when exactness matters.
 */
export class KvRateLimitBackend implements RateLimitBackend {
  readonly name = "kv";
  constructor(private readonly kv: KvBinding) {}
  async check(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    const resetAt = windowStart + rule.windowMs;
    const storageKey = `rl:${key}:${windowStart}`;
    const raw = await this.kv.get(storageKey);
    const count = Number(raw ?? 0) || 0;
    if (count >= rule.limit) {
      return resultFrom(false, rule, 0, Math.max(1, Math.ceil((resetAt - now) / 1000)), now);
    }
    await this.kv.put(storageKey, String(count + 1), {
      expirationTtl: Math.max(60, Math.ceil(rule.windowMs / 1000) + 10),
    });
    return resultFrom(true, rule, Math.max(0, rule.limit - count - 1), 0, now);
  }
}

/** Fail open on backend errors: availability beats a hard outage. */
export class ResilientRateLimitBackend implements RateLimitBackend {
  constructor(
    private readonly primary: RateLimitBackend,
    private readonly fallback: RateLimitBackend = new LocalRateLimitBackend(),
  ) {}
  get name(): string {
    return this.primary.name;
  }
  async check(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    try {
      return await this.primary.check(key, rule);
    } catch (error) {
      console.warn(`[rate-limit] ${this.primary.name} failed, using ${this.fallback.name}`, error);
      return this.fallback.check(key, rule);
    }
  }
}

export function selectBackend(env: unknown): RateLimitBackend {
  const bindings = (env && typeof env === "object" ? env : {}) as RateLimitBindings;
  const native = bindings.ARINX_RATE_LIMITER;
  if (native && typeof native.limit === "function") {
    return new ResilientRateLimitBackend(new WorkersRateLimitBackend(native));
  }
  const durable = bindings.ARINX_RATE_LIMITS_DO;
  if (durable && typeof durable.idFromName === "function") {
    return new ResilientRateLimitBackend(new DurableObjectRateLimitBackend(durable));
  }
  const kv = bindings.ARINX_RATE_LIMITS_KV;
  if (kv && typeof kv.get === "function" && typeof kv.put === "function") {
    return new ResilientRateLimitBackend(new KvRateLimitBackend(kv));
  }
  return new LocalRateLimitBackend();
}

let activeBackend: RateLimitBackend = new LocalRateLimitBackend();
let registeredEnv: unknown;

/** Idempotent, cheap to call on every request. */
export function registerRateLimitBackend(env: unknown): RateLimitBackend {
  if (env && env === registeredEnv) return activeBackend;
  registeredEnv = env;
  activeBackend = selectBackend(env);
  return activeBackend;
}

/** Test/debug hook. */
export function setRateLimitBackend(backend: RateLimitBackend | null): void {
  activeBackend = backend ?? new LocalRateLimitBackend();
  registeredEnv = undefined;
}

export function getActiveBackend(): RateLimitBackend {
  return activeBackend;
}

export async function checkRateLimit(
  key: string,
  rule: RateLimitRule = LIMITS.document,
): Promise<RateLimitResult> {
  return activeBackend.check(key, rule);
}
