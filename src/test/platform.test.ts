import { describe, expect, it } from "vitest";
import {
  LIMITS,
  RateLimiter,
  clientKeyFromRequest,
  isStaticAssetPath,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import {
  BASELINE_CSP,
  ENFORCED_CSP,
  PERMISSIONS_POLICY,
  TARGET_CSP,
  applySecurityHeaders,
  buildCspHeaders,
  isPrivatePath,
  newRequestId,
} from "@/lib/security-headers.server";
import {
  CORE_HASHES,
  CORE_VERSION,
  MAX_INPUT_BYTES,
  coreAssetUrls,
  constantTimeHexEqual,
  estimateEtaSeconds,
  overlayPos,
  planEncoding,
  sanitizeWatermarkText,
  sha256Hex,
  type EncodePlanInput,
} from "@/lib/media-plan";
import { buildRssFeed, buildSitemapIndexXml } from "@/lib/sitemap";
import { chaptersJsonLd, parseChapters, videoCarouselJsonLd, webSiteJsonLd } from "@/lib/seo";
import { safeExternalUrl } from "@/lib/watch-tools";
import { SITE_URL } from "@/lib/site";
import type { PublicVideoMeta } from "@/lib/catalog";

describe("platform rate limiting", () => {
  it("enforces a fixed window, isolates keys, and resets when it elapses", () => {
    let now = 1_000;
    const limiter = new RateLimiter(20_000, () => now);
    const limit = { limit: 2, windowMs: 60_000 };
    expect(limiter.check("a|/", limit).allowed).toBe(true);
    expect(limiter.check("a|/", limit).allowed).toBe(true);
    const blocked = limiter.check("a|/", limit);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(limiter.check("b|/", limit).allowed).toBe(true);
    now = 61_001;
    expect(limiter.check("a|/", limit).allowed).toBe(true);
  });

  it("bounds its memory when flooded with distinct keys", () => {
    let now = 0;
    const limiter = new RateLimiter(10, () => now);
    for (let i = 0; i < 100; i++) limiter.check(`key-${i}`, LIMITS.document);
    expect(limiter.size).toBeLessThanOrEqual(10);
    now = 61_000;
    limiter.check("another", LIMITS.document);
    expect(limiter.size).toBeLessThanOrEqual(10);
  });

  it("prefers the edge-provided client IP over spoofable headers", () => {
    const req = new Request(SITE_URL, {
      headers: {
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1",
      },
    });
    expect(clientKeyFromRequest(req)).toBe("203.0.113.7");
    const forwarded = new Request(SITE_URL, {
      headers: { "x-forwarded-for": "198.51.100.1, 192.0.2.9" },
    });
    expect(clientKeyFromRequest(forwarded)).toBe("198.51.100.1");
    expect(clientKeyFromRequest(new Request(SITE_URL))).toBe("unknown");
  });

  it("does not spend document budget on hashed assets but does on SEO endpoints", () => {
    expect(isStaticAssetPath("/assets/index-Bk29.js")).toBe(true);
    expect(isStaticAssetPath("/logo.png")).toBe(true);
    expect(isStaticAssetPath("/sitemap.xml")).toBe(false);
    expect(isStaticAssetPath("/feed.xml")).toBe(false);
    expect(isStaticAssetPath("/robots.txt")).toBe(false);
  });

  it("returns a standards-compliant 429 with Retry-After", () => {
    const limiter = new RateLimiter();
    limiter.check("x", LIMITS.cspReport);
    limiter.check("x", LIMITS.cspReport);
    const result = { ...limiter.check("x", { limit: 1, windowMs: 60_000 }) };
    const res = rateLimitedResponse(result);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe(String(result.retryAfter));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("RateLimit-Limit")).toBe("1");
  });
});

describe("platform security headers", () => {
  it("ships an enforced CSP and a stricter Report-Only target", () => {
    const enforced = buildCspHeaders(false);
    expect(enforced.enforced).toBe(ENFORCED_CSP);
    expect(enforced.enforced).toContain(BASELINE_CSP.split(";")[0].trim());
    expect(enforced.enforced).toContain("report-uri /csp-report");
    expect(enforced.enforced).not.toContain("require-trusted-types-for");
    expect(enforced.reportOnly).toBe(TARGET_CSP);
    const targetScriptSrc = TARGET_CSP.split("; ").find((part) => part.startsWith("script-src "));
    expect(targetScriptSrc).not.toContain("'unsafe-inline'");
    expect(targetScriptSrc).not.toContain("'unsafe-eval'");
    expect(TARGET_CSP).toContain("require-trusted-types-for 'script'");
    expect(ENFORCED_CSP).toContain("frame-ancestors");

    const downgraded = buildCspHeaders(true);
    expect(downgraded.enforced).toBe(BASELINE_CSP);
    expect(downgraded.reportOnly).toBe(TARGET_CSP);
  });

  it("allows the Lovable editor, the e2b preview, and public embeds to frame the app", () => {
    for (const origin of ["https://lovable.dev", "https://*.lovable.app", "https://*.e2b.app"]) {
      expect(TARGET_CSP).toContain(origin);
    }
    expect(BASELINE_CSP).toContain("frame-ancestors 'self' https:");
  });

  it("sets the full header set, HSTS on HTTPS, and no-store on private paths", () => {
    const response = applySecurityHeaders(new Response("ok"), {
      pathname: "/studio/upload",
      isHttps: true,
    });
    expect(response.headers.get("Content-Security-Policy")).toBe(ENFORCED_CSP);
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBe(TARGET_CSP);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Permissions-Policy")).toBe(PERMISSIONS_POLICY);
    expect(response.headers.get("X-Permitted-Cross-Domain-Policies")).toBe("none");
    expect(response.headers.get("X-DNS-Prefetch-Control")).toBe("off");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{16,}$/i);
    // X-Frame-Options would break the Lovable editor and /embed/:id.
    expect(response.headers.get("X-Frame-Options")).toBeNull();
    // An app-set header must survive.
    const withAppHeader = applySecurityHeaders(
      new Response("ok", { headers: { "x-app": "kept" } }),
      { pathname: "/", isHttps: true },
    );
    expect(withAppHeader.headers.get("x-app")).toBe("kept");
  });

  it("keeps public pages cacheable and omits HSTS on plain HTTP", () => {
    const local = applySecurityHeaders(new Response("ok"), {
      pathname: "/",
      isHttps: false,
    });
    expect(local.headers.get("Strict-Transport-Security")).toBeNull();
    expect(local.headers.get("Cache-Control")).toBeNull();
  });

  it("treats authenticated and duplicate surfaces as private", () => {
    for (const path of ["/admin", "/auth/callback", "/studio", "/library", "/results"]) {
      expect(isPrivatePath(path)).toBe(true);
    }
    expect(isPrivatePath("/administrator")).toBe(false);
    expect(isPrivatePath("/")).toBe(false);
    expect(isPrivatePath("/watch/abc")).toBe(false);
    expect(newRequestId()).not.toBe(newRequestId());
  });
});

describe("enterprise encoding plan", () => {
  const probe = {
    width: 1920,
    height: 1080,
    duration: 120,
    videoCodec: "h264",
    audioCodec: "aac",
    container: "mp4",
  };
  const base: EncodePlanInput = {
    preset: "balanced",
    probe,
    names: { input: "in.mp4", watermark: "wm.png", invisible: "tag.png", output: "out.mp4" },
    position: "bottom-right",
    multithreaded: false,
    fingerprint: "abc123",
    ownerTag: "@devtime",
    watermarkText: "ArinX",
  };

  it("pins each core asset to versioned mirrors and SHA-256 digests", () => {
    expect(CORE_VERSION).toBe("0.12.6");
    expect(coreAssetUrls("st", "ffmpeg-core.js")[0]).toContain(`@ffmpeg/core@${CORE_VERSION}`);
    expect(coreAssetUrls("mt", "ffmpeg-core.worker.js")[0]).toContain(
      `@ffmpeg/core-mt@${CORE_VERSION}`,
    );
    const digests = Object.values(CORE_HASHES).flatMap((files) => Object.values(files));
    expect(digests).toHaveLength(5);
    for (const digest of digests) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(MAX_INPUT_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });

  it("computes stable SHA-256 digests and compares them in constant time", async () => {
    const digest = await sha256Hex(new Uint8Array([1, 2, 3]));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(new Uint8Array([1, 2, 3]))).toBe(digest);
    expect(await sha256Hex(new Uint8Array([1, 2, 4]))).not.toBe(digest);
    expect(constantTimeHexEqual(digest, digest)).toBe(true);
    expect(constantTimeHexEqual(digest, "0".repeat(64))).toBe(false);
    expect(constantTimeHexEqual("zzz", "zzz")).toBe(false);
    expect(constantTimeHexEqual(digest, digest.slice(1))).toBe(false);
  });

  it("scales only when necessary and always produces even dimensions", () => {
    const plan = planEncoding({ ...base, probe: { ...probe, width: 1280, height: 720 } });
    expect(plan.outWidth).toBe(1280);
    expect(plan.outHeight).toBe(720);
    expect(plan.needsScale).toBe(false);
    expect(planEncoding({ ...base, probe: { ...probe, width: 1921, height: 1081 } }).outWidth).toBe(
      1920,
    );
    const scaled = planEncoding({ ...base, probe: { ...probe, width: 3840, height: 2160 } });
    expect(scaled.needsScale).toBe(true);
    expect(scaled.outWidth).toBe(1920);
    expect(scaled.outHeight).toBe(1080);
    // No probe: dimensions are resolved by ffmpeg, never guessed in JS.
    const unknown = planEncoding({ ...base, probe: null });
    expect(unknown.outWidth).toBeNull();
    expect(unknown.needsScale).toBe(true);
    expect(unknown.filterGraph).toContain("'min(1920,iw)':-2");
  });

  it("uses exact-size overlays, never scale2ref, and copies only compatible AAC", () => {
    const plan = planEncoding(base);
    expect(plan.filterGraph).not.toContain("scale2ref");
    expect(plan.filterGraph).toContain("format=auto");
    expect(plan.filterGraph).toContain("eof_action=repeat");
    expect(plan.filterGraph).toContain("eval=init");
    expect(plan.filterGraph).toContain("[2:v]overlay=0:0");
    expect(plan.filterGraph).toContain("[tagged][1:v]overlay=W-w-24:H-h-24");
    expect(plan.copyAudio).toBe(true);
    expect(plan.args).toContain("copy");
    expect(planEncoding({ ...base, probe: { ...probe, container: "matroska" } }).copyAudio).toBe(
      false,
    );
    expect(planEncoding({ ...base, probe: { ...probe, audioCodec: "opus" } }).copyAudio).toBe(
      false,
    );
  });

  it("emits fast, deterministic ffmpeg arguments and tags the output", () => {
    const plan = planEncoding(base);
    expect(plan.args).toContain("veryfast");
    expect(plan.args).toContain("-movflags");
    expect(plan.args).toContain("+faststart");
    expect(plan.args.join(" ")).toContain("comment=arinx:wm:abc123");
    expect(plan.args).toContain("-map_metadata");
    expect(plan.args).toContain("-map_chapters");
    expect(plan.args).toContain("-sn");
    expect(plan.args).toContain("-dn");
    expect(plan.args.at(-1)).toBe("out.mp4");
    expect(planEncoding({ ...base, preset: "ultra" }).args).toContain("ultrafast");
    expect(planEncoding({ ...base, multithreaded: true }).threads).toBe(0);
  });

  it("keeps watermark text bounded and overlay coordinates allowlisted", () => {
    expect(sanitizeWatermarkText("  A\u0000B\n C  ")).toBe("AB C");
    expect(sanitizeWatermarkText("x".repeat(200))).toHaveLength(120);
    expect(sanitizeWatermarkText("x".repeat(200), 32)).toHaveLength(32);
    expect(overlayPos("top-left")).toBe("24:24");
    expect(overlayPos("top-right")).toBe("W-w-24:24");
    expect(overlayPos("bottom-left")).toBe("24:H-h-24");
    expect(overlayPos("something-else")).toBe("W-w-24:H-h-24");
    expect(planEncoding({ ...base, watermarkText: "A\nB" }).args.join(" ")).not.toContain("A\nB");
  });

  it("estimates progress ETA only from meaningful throughput", () => {
    expect(estimateEtaSeconds(2_000, 0.5)).toBe(2);
    expect(estimateEtaSeconds(500, 0.5)).toBeNull();
    expect(estimateEtaSeconds(2_000, 0.01)).toBeNull();
    expect(estimateEtaSeconds(2_000, 1)).toBe(0);
  });
});

describe("tag and discovery fixes", () => {
  it("removes the SearchAction that conflicted with Disallow: /results", () => {
    const ld = webSiteJsonLd() as { potentialAction?: unknown };
    expect(ld.potentialAction).toBeUndefined();
  });

  it("builds a sitemap index with escaped absolute locs", () => {
    const index = buildSitemapIndexXml([
      { loc: "/sitemap-pages.xml" },
      { loc: `${SITE_URL}/sitemap-videos.xml?page=2&x=1` },
      { loc: "/sitemap-pages.xml" },
    ]);
    expect(index).toContain("<sitemapindex");
    expect(index).toContain(`${SITE_URL}/sitemap-pages.xml`);
    expect(index).toContain("page=2&amp;x=1");
    expect(index.match(/<sitemap>/g)).toHaveLength(2);
  });

  it("builds an RSS/MRSS feed with escaped titles and media elements", () => {
    const feed = buildRssFeed([
      {
        id: "abc",
        title: 'Cats & dogs "forever"',
        path: "/watch/abc",
        description: "A < B ]]> injected",
        publishedAt: "2026-11-01T00:00:00.000Z",
        thumbnail: `${SITE_URL}/media/thumbnail/abc`,
        player: `${SITE_URL}/embed/abc`,
        duration: 125,
        author: "Dev Time",
      },
    ]);
    expect(feed).toContain('<rss version="2.0"');
    expect(feed).toContain("xmlns:media");
    expect(feed).toContain("<media:thumbnail");
    expect(feed).toContain("<media:player");
    expect(feed).toContain("<media:content");
    expect(feed).toContain("Cats &amp; dogs");
    expect(feed).toContain("A &lt; B");
    expect(feed).not.toContain("<script");
  });

  it("requires two chronological chapters before emitting Clip / SeekToAction", () => {
    expect(parseChapters("just a description")).toEqual([]);
    const meta = (description: string): PublicVideoMeta => ({
      kind: "video",
      id: "abc",
      title: "Demo video",
      description,
      uploaded: "2026-10-01T00:00:00.000Z",
      duration: 3725,
      views: 120,
      category: "Tech",
      tags: ["react"],
      handle: "devtime",
      channelName: "Dev Time",
      thumbnail: `${SITE_URL}/media/thumbnail/abc`,
      isShort: false,
    });
    const desc = "Intro\n0:00 Setup\n1:20 Build\n2:45 Ship it";
    expect(chaptersJsonLd(meta("just a description"), `${SITE_URL}/watch/abc`)).toBeNull();
    const chapters = parseChapters(desc);
    expect(chapters).toHaveLength(3);
    const ld = chaptersJsonLd(meta(desc), `${SITE_URL}/watch/abc`) as {
      hasPart: Array<{ "@type": string; startOffset: number; endOffset: number }>;
      potentialAction: { "@type": string; target: string };
    };
    expect(ld.hasPart).toHaveLength(3);
    expect(ld.hasPart.every((part) => part["@type"] === "Clip")).toBe(true);
    expect(ld.hasPart[1].startOffset).toBe(80);
    expect(ld.hasPart[1].endOffset).toBe(165);
    expect(ld.potentialAction["@type"]).toBe("SeekToAction");
    expect(ld.potentialAction.target).toContain("{seek_to_second_number}");
  });

  it("emits a valid video carousel with capped, absolute ListItem URLs", () => {
    const videos = Array.from({ length: 35 }, (_, i) => ({
      id: `v${i}`,
      title: `Video ${i}`,
      description: "Demo",
      thumbnail: `${SITE_URL}/media/thumbnail/v${i}`,
      duration: 60,
      publishedAt: "2026-11-01T00:00:00.000Z",
      views: 1,
    }));
    const ld = videoCarouselJsonLd(videos, "Trending", `${SITE_URL}/trending`) as {
      "@type": string;
      numberOfItems: number;
      itemListElement: Array<{ "@type": string; item: { "@type": string; url: string } }>;
    };
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.numberOfItems).toBe(30);
    expect(ld.itemListElement).toHaveLength(30);
    expect(ld.itemListElement[0]["@type"]).toBe("ListItem");
    expect(ld.itemListElement[0].item["@type"]).toBe("VideoObject");
    expect(ld.itemListElement[0].item.url).toBe(`${SITE_URL}/watch/v0`);
  });

  it("rejects plaintext creator links (mixed content)", () => {
    expect(safeExternalUrl("https://example.com")).toBe("https://example.com/");
    expect(safeExternalUrl("http://example.com")).toBeNull();
  });
});
