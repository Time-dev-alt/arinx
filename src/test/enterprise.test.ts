import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEV_CSP,
  ENFORCED_CSP,
  TARGET_CSP,
  BASELINE_CSP,
  applySecurityHeaders,
  buildCspHeaders,
} from "@/lib/security-headers.server";
import {
  getRequestContext,
  newCspNonce,
  registerRequestContextStore,
  runWithRequestContext,
} from "@/lib/request-context";
import {
  DurableObjectRateLimitBackend,
  KvRateLimitBackend,
  LocalRateLimitBackend,
  ResilientRateLimitBackend,
  WorkersRateLimitBackend,
  checkRateLimit,
  getActiveBackend,
  selectBackend,
  setRateLimitBackend,
  shardFor,
  type RateLimitBackend,
} from "@/lib/rate-limit-backend";
import { LIMITS, type RateLimitResult } from "@/lib/rate-limit";
import { handleOpsRequest, isOpsPath } from "@/lib/ops-routes.server";
import {
  detectFormat,
  readSignature,
  validateFileSignature,
  validateMime,
} from "@/lib/file-signatures";
import { ArinXRateLimiterDO } from "@/worker/rate-limiter-do";

afterEach(() => {
  setRateLimitBackend(null);
  vi.unstubAllEnvs();
});

describe("per-request context and strict CSP", () => {
  it("generates unique 128-bit nonces", () => {
    const a = newCspNonce();
    const b = newCspNonce();
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
  });

  it("scopes context to an async run and never leaks across requests", async () => {
    const store = {
      store: undefined as { requestId: string; nonce: string } | undefined,
      run<T>(ctx: { requestId: string; nonce: string }, fn: () => T): T {
        const previous = this.store;
        this.store = ctx;
        try {
          return fn();
        } finally {
          this.store = previous;
        }
      },
      getStore() {
        return this.store;
      },
    };
    registerRequestContextStore(store);
    expect(getRequestContext()).toBeUndefined();
    expect(
      runWithRequestContext({ requestId: "r1", nonce: "n1" }, () => getRequestContext()),
    ).toEqual({ requestId: "r1", nonce: "n1" });
    expect(getRequestContext()).toBeUndefined();
  });

  it("enforces nonce + strict-dynamic with no inline/eval escape hatches", () => {
    const nonce = "dGVzdC1ub25jZQ==";
    const { enforced, reportOnly } = buildCspHeaders(false, { nonce });
    expect(enforced).toContain(`'nonce-${nonce}'`);
    expect(enforced).toContain("'strict-dynamic'");
    const scriptSrc = enforced.split("; ").find((part) => part.startsWith("script-src "));
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    // Inline style attributes still require this one exception.
    expect(enforced).toContain("style-src 'self' 'unsafe-inline'");
    expect(reportOnly).toContain("require-trusted-types-for 'script'");
    expect(reportOnly).toContain(`'nonce-${nonce}'`);
    // Static asset policies are strict too, but carry no nonce.
    expect(ENFORCED_CSP.split("; ").find((p) => p.startsWith("script-src "))).not.toContain(
      "'unsafe-inline'",
    );
    expect(ENFORCED_CSP).not.toContain("'unsafe-eval'");
    expect(TARGET_CSP).toContain("require-trusted-types-for");
  });

  it("keeps Vite dev working with a compatibility policy", () => {
    const { enforced } = buildCspHeaders(false, { dev: true });
    expect(enforced).toBe(DEV_CSP);
    expect(enforced).toContain("'unsafe-eval'");
    expect(enforced).toContain("'unsafe-inline'");
  });

  it("supports emergency downgrade and opt-in Trusted Types enforcement", () => {
    expect(buildCspHeaders(true).enforced).toBe(BASELINE_CSP);
    vi.stubEnv("ARINX_TRUSTED_TYPES", "1");
    const strict = buildCspHeaders(false, { nonce: "abc" });
    expect(strict.enforced).toContain("require-trusted-types-for 'script'");
    expect(strict.reportOnly).toContain("frame-ancestors");
  });

  it("puts the same nonce in the response header and never removes app headers", () => {
    const res = applySecurityHeaders(
      new Response("ok", { headers: { "x-app": "kept" } }),
      { pathname: "/", isHttps: true },
      { nonce: "abc123", dev: false },
    );
    expect(res.headers.get("Content-Security-Policy")).toContain("'nonce-abc123'");
    expect(res.headers.get("x-app")).toBe("kept");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });
});

describe("globally exact rate-limit backends", () => {
  const rule = { limit: 2, windowMs: 60_000 };

  it("prefers Cloudflare's native binding over every other option", () => {
    const native = { limit: async () => ({ success: true }) };
    const env = {
      ARINX_RATE_LIMITER: native,
      ARINX_RATE_LIMITS_DO: { idFromName: () => ({ fetch: async () => new Response("") }) },
      ARINX_RATE_LIMITS_KV: { get: async () => null, put: async () => {} },
    };
    expect(selectBackend(env).name).toBe("cloudflare-ratelimit");
    expect(selectBackend({}).name).toBe("local");
  });

  it("uses Cloudflare's atomic API and reports a 429 when it says no", async () => {
    let success = true;
    const backend = new WorkersRateLimitBackend({
      limit: async ({ key }) => {
        expect(key).toBe("doc:198.51.100.1");
        return { success };
      },
    });
    expect((await backend.check("doc:198.51.100.1", rule)).allowed).toBe(true);
    success = false;
    const blocked = await backend.check("doc:198.51.100.1", rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("shards Durable Object keys deterministically", () => {
    expect(shardFor("a")).toBe(shardFor("a"));
    expect(shardFor("a")).not.toBe(shardFor("b"));
    for (let i = 0; i < 100; i++) {
      expect(shardFor(`key-${i}`)).toMatch(/^arinx-ratelimit-shard-[0-9]+$/);
    }
  });

  it("delegates to a Durable Object stub", async () => {
    const result: RateLimitResult = {
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfter: 17,
      resetAt: Date.now() + 17_000,
    };
    let body = "";
    const backend = new DurableObjectRateLimitBackend({
      idFromName: (name) => ({
        fetch: async (_input, init) => {
          expect(name).toMatch(/^arinx-ratelimit-shard-/);
          body = String(init?.body);
          return new Response(JSON.stringify(result), { status: 200 });
        },
      }),
    });
    expect(await backend.check("client", rule)).toEqual(result);
    expect(JSON.parse(body)).toMatchObject({ key: "client", limit: 2, windowMs: 60_000 });
  });

  it("counts in KV with a per-window TTL", async () => {
    const data = new Map<string, string>();
    const ttls: number[] = [];
    const backend = new KvRateLimitBackend({
      get: async (key: string) => data.get(key) ?? null,
      put: async (key: string, value: string, opts) => {
        data.set(key, value);
        ttls.push(opts?.expirationTtl ?? 0);
      },
    });
    expect((await backend.check("client", rule)).allowed).toBe(true);
    expect((await backend.check("client", rule)).allowed).toBe(true);
    expect((await backend.check("client", rule)).allowed).toBe(false);
    expect(ttls[0]).toBeGreaterThanOrEqual(60);
  });

  it("fails open to the local limiter when a remote backend errors", async () => {
    const broken: RateLimitBackend = {
      name: "broken",
      check: async () => {
        throw new Error("DO unavailable");
      },
    };
    const backend = new ResilientRateLimitBackend(broken, new LocalRateLimitBackend());
    expect((await backend.check("fallback-key", { limit: 1, windowMs: 60_000 })).allowed).toBe(
      true,
    );
  });

  it("routes every call site through the registered backend", async () => {
    const fake: RateLimitBackend = {
      name: "fake",
      check: async () => ({
        allowed: false,
        limit: 7,
        remaining: 0,
        retryAfter: 9,
        resetAt: Date.now() + 9_000,
      }),
    };
    setRateLimitBackend(fake);
    expect(getActiveBackend().name).toBe("fake");
    expect((await checkRateLimit("any", LIMITS.document)).allowed).toBe(false);
  });
});

describe("operational endpoints", () => {
  const get = (path: string) => new Request(`https://arin-x.lovable.app${path}`);

  it("recognises only its own paths", () => {
    expect(isOpsPath("/healthz")).toBe(true);
    expect(isOpsPath("/")).toBe(false);
    expect(isOpsPath("/sitemap.xml")).toBe(false);
  });

  it("answers liveness, readiness and RFC 9116 security.txt with no-store", async () => {
    const health = await handleOpsRequest(get("/healthz"));
    expect(health?.status).toBe(200);
    expect(health?.headers.get("cache-control")).toContain("no-store");
    expect(await health?.json()).toMatchObject({ status: "ok", service: "arinx" });

    const ready = await handleOpsRequest(get("/readyz"));
    expect(await ready?.json()).toMatchObject({ status: "ready", checks: { ssr: "ok" } });

    const security = await handleOpsRequest(get("/.well-known/security.txt"));
    expect(security?.status).toBe(200);
    expect(await security?.text()).toContain("Contact: mailto:security@arin-x.lovable.app");
  });

  it("validates and rate limits the RUM beacon", async () => {
    const post = (body: unknown) =>
      new Request("https://arin-x.lovable.app/rum", { method: "POST", body: JSON.stringify(body) });
    const ok = await handleOpsRequest(post({ metric: "LCP", value: 2400, path: "/watch/abc" }));
    expect(ok?.status).toBe(204);

    expect((await handleOpsRequest(post({ metric: "EVIL", value: 1, path: "/" })))?.status).toBe(
      400,
    );
    expect((await handleOpsRequest(post({ metric: "LCP", value: -1, path: "/" })))?.status).toBe(
      400,
    );
    expect(
      (await handleOpsRequest(post({ metric: "LCP", value: 1, path: "https://evil.example" })))
        ?.status,
    ).toBe(400);
    expect((await handleOpsRequest(post("not an object")))?.status).toBe(400);
    expect((await handleOpsRequest(get("/rum")))?.status).toBe(405);

    setRateLimitBackend({
      name: "deny",
      check: async () => ({
        allowed: false,
        limit: 0,
        remaining: 0,
        retryAfter: 5,
        resetAt: Date.now() + 5_000,
      }),
    });
    expect((await handleOpsRequest(post({ metric: "FCP", value: 100, path: "/" })))?.status).toBe(
      429,
    );
  });
});

describe("upload magic-byte validation", () => {
  const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

  it("detects real container signatures", () => {
    expect(detectFormat(mp4)).toBe("mp4");
    expect(detectFormat(webm)).toBe("webm");
    expect(detectFormat(png)).toBe("png");
    expect(detectFormat(jpeg)).toBe("jpeg");
    expect(detectFormat(new Uint8Array(4))).toBe("unknown");
    expect(detectFormat(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBe("unknown");
  });

  it("rejects disguised files, wrong buckets and mismatched extensions", () => {
    expect(validateFileSignature(mp4, "videos", "mp4").ok).toBe(true);
    expect(validateFileSignature(mp4, "videos", "mov").ok).toBe(true);
    expect(validateFileSignature(png, "videos", "mp4").ok).toBe(false);
    expect(validateFileSignature(png, "thumbnails", "mp4").ok).toBe(false);
    expect(validateFileSignature(png, "thumbnails", "png").ok).toBe(true);
    expect(validateFileSignature(jpeg, "thumbnails", "jpg").ok).toBe(true);
    expect(validateFileSignature(mp4, "thumbnails", "png").ok).toBe(false);
  });

  it("rejects forged MIME types and reads only the header", async () => {
    expect(validateMime("video/mp4", "videos")).toBe(true);
    expect(validateMime("text/html", "videos")).toBe(false);
    expect(validateMime("image/png", "thumbnails")).toBe(true);
    expect(validateMime("application/x-msdownload", "thumbnails")).toBe(false);
    const blob = new Blob([new Uint8Array(4096).fill(7).buffer]);
    expect(await readSignature(blob)).toHaveLength(32);
  });
});

describe("Durable Object limiter", () => {
  const data = new Map<string, { count: number; resetAt: number }>();
  const makeDo = () =>
    new ArinXRateLimiterDO({
      storage: {
        get: async <T>(key: string) => data.get(key) as T | undefined,
        put: async <T>(key: string, value: T) => {
          data.set(key, value as { count: number; resetAt: number });
        },
        delete: async (key: string) => data.delete(key),
        deleteAll: async () => data.clear(),
      },
      blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
    });

  const call = (body: unknown, method = "POST") =>
    new Request("https://arinx.internal/rate-limit", {
      method,
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });

  it("counts a fixed window and rejects malformed requests", async () => {
    data.clear();
    const doObject = makeDo();
    const rule = { key: "client", limit: 2, windowMs: 60_000 };
    expect((await (await doObject.fetch(call(rule))).json()).allowed).toBe(true);
    expect((await (await doObject.fetch(call(rule))).json()).allowed).toBe(true);
    expect((await (await doObject.fetch(call(rule))).json()).allowed).toBe(false);
    expect((await doObject.fetch(call({ ...rule, limit: -1 }))).status).toBe(400);
    expect((await doObject.fetch(call(rule, "GET"))).status).toBe(405);
  });
});
