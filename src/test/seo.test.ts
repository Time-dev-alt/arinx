import { describe, expect, it } from "vitest";
import { buildRobotsTxt, buildSitemapXml, escapeXml } from "@/lib/sitemap";
import {
  breadcrumbJsonLd,
  cleanMetaText,
  isoDuration,
  itemListJsonLd,
  pageHead,
  videoJsonLd,
  webSiteJsonLd,
} from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import type { PublicVideoMeta } from "@/lib/catalog";

describe("XML sitemap", () => {
  it("escapes user-generated text and emits the video extension", () => {
    const xml = buildSitemapXml([
      {
        path: "/watch/abc",
        lastmod: "2026-11-01T10:00:00.000Z",
        changefreq: "weekly",
        priority: 0.7,
        video: {
          title: 'Cats & dogs "forever" <3',
          description: "A & B",
          thumbnail: `${SITE_URL}/media/thumbnail/abc`,
          player: `${SITE_URL}/embed/abc`,
          publishedAt: "2026-11-01",
          duration: 125,
          views: 42,
          tags: ["pets"],
        },
      },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(`${SITE_URL}/watch/abc`);
    expect(xml).toContain("<lastmod>2026-11-01</lastmod>");
    expect(xml).toContain("<video:thumbnail_loc>");
    expect(xml).toContain("<video:duration>125</video:duration>");
    expect(xml).toContain("Cats &amp; dogs &quot;forever&quot; &lt;3");
    expect(xml).toContain("A &amp; B");
    expect(xml).not.toContain("<script");
  });

  it("deduplicates URLs and ignores non-root paths", () => {
    const xml = buildSitemapXml([{ path: "/" }, { path: "/" }, { path: "https://evil.example/" }]);
    expect(xml.match(/<loc>/g)).toHaveLength(1);
    expect(xml).not.toContain("evil.example");
  });

  it("escapeXml handles every XML special character", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("robots.txt points at the sitemap and keeps private pages out", () => {
    const robots = buildRobotsTxt();
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /results");
    // Google must be able to fetch the player/image named in the video sitemap.
    expect(robots).not.toContain("Disallow: /embed/");
    expect(robots).not.toContain("Disallow: /media/thumbnail/");
  });
});

describe("page head", () => {
  it("emits a canonical, social cards and structured data", () => {
    const head = pageHead("Trending", "Popular videos", {
      path: "/trending",
      jsonLd: webSiteJsonLd(),
    });
    const canonical = head.links.find((l) => l.rel === "canonical");
    expect(canonical?.href).toBe(`${SITE_URL}/trending`);
    expect(head.meta).toContainEqual({ property: "og:url", content: `${SITE_URL}/trending` });
    expect(head.meta).toContainEqual({ name: "robots", content: expect.stringContaining("index") });
    expect(head.meta.some((m) => "script:ld+json" in m)).toBe(true);
    expect(head.meta).toContainEqual({ title: "Trending | ArinX" });
  });

  it("marks private pages noindex and omits their canonical", () => {
    const head = pageHead("Studio", "Manage videos", { noindex: true });
    expect(head.meta).toContainEqual({
      name: "robots",
      content: expect.stringContaining("noindex"),
    });
    expect(head.links).toHaveLength(0);
  });

  it("cleans control characters, tags and long descriptions", () => {
    expect(cleanMetaText("  <b>Hello</b>\n world  ", 20)).toBe("Hello world");
    expect(cleanMetaText("x".repeat(500), 160)).toHaveLength(160);
  });
});

describe("structured data helpers", () => {
  const meta: PublicVideoMeta = {
    kind: "video",
    id: "abc",
    title: "Demo video",
    description: "A demo",
    uploaded: "2026-10-01T00:00:00.000Z",
    duration: 3725,
    views: 120,
    category: "Tech",
    tags: ["react"],
    handle: "devtime",
    channelName: "Dev Time",
    thumbnail: `${SITE_URL}/media/thumbnail/abc`,
    isShort: false,
  };

  it("builds a Google-friendly VideoObject with a stable embed URL", () => {
    const ld = videoJsonLd(meta);
    expect(ld["@type"]).toBe("VideoObject");
    expect(ld.duration).toBe("PT1H2M5S");
    expect(ld.embedUrl).toContain("/embed/abc");
    expect(Array.isArray(ld.thumbnailUrl)).toBe(true);
  });

  it("converts seconds to ISO 8601 durations", () => {
    expect(isoDuration(0)).toBe("PT0S");
    expect(isoDuration(90)).toBe("PT1M30S");
    expect(isoDuration(-4)).toBe("PT0S");
  });

  it("builds item lists and breadcrumbs with absolute URLs", () => {
    const list = itemListJsonLd([{ id: "a", title: "A" }], "List", `${SITE_URL}/trending`);
    expect(list["@type"]).toBe("ItemList");
    const crumbs = breadcrumbJsonLd([{ name: "Home", path: "/" }]);
    expect(crumbs["@type"]).toBe("BreadcrumbList");
  });
});
