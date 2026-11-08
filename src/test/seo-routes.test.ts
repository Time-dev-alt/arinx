import { beforeAll, describe, expect, it, vi } from "vitest";

// The crawler endpoints must work from the production server entry even when
// the Start router is never reached (that is the historical 404 sitemap bug).
type ServerFetch = (request: Request, env: unknown, ctx: unknown) => Promise<Response>;
type SeoHandler = (request: Request) => Promise<Response | null>;

let serverFetch: ServerFetch;
let handleSeoRequest: SeoHandler;

beforeAll(async () => {
  vi.stubEnv("ARINX_DEMO_DATA", "1");
  const entry = await import("@/server");
  serverFetch = entry.default.fetch as ServerFetch;
  const seo = await import("@/lib/seo-routes.server");
  handleSeoRequest = seo.handleSeoRequest;
});

const get = (path: string) =>
  serverFetch(
    new Request(`https://arin-x.lovable.app${path}`, {
      headers: { "x-forwarded-for": "198.51.100.5" },
    }),
    {},
    {},
  );

describe("production SSR entry: crawler endpoints", () => {
  it("serves robots.txt with a hardened content type", async () => {
    const res = await get("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(await res.text()).toContain("Sitemap: https://arin-x.lovable.app/sitemap.xml");
  });

  it("serves a video sitemap without hitting the SSR router", async () => {
    const res = await get("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    const xml = await res.text();
    expect(xml).toContain("<urlset");
    expect(xml).toContain("<video:video>");
    expect(xml).toContain("<video:player_loc");
    // Static pages must not claim to have been modified on every crawl.
    expect(xml).not.toContain(`<loc>https://arin-x.lovable.app/</loc>\n    <lastmod>`);
  });

  it("serves every sitemap shard and a paginated video shard", async () => {
    for (const path of [
      "/sitemap-pages.xml",
      "/sitemap-channels.xml",
      "/sitemap-videos.xml",
      "/sitemap-videos.xml?page=2",
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).toContain("<urlset");
    }
  });

  it("serves an RSS/MRSS feed with the right content type", async () => {
    const res = await get("/feed.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await res.text();
    expect(xml).toContain("<rss");
    expect(xml).toContain("xmlns:media");
    expect(xml).toContain("<media:thumbnail");
  });

  it("redirects thumbnails to the canonical origin, not the request origin", async () => {
    const res = await get("/media/thumbnail/11111111-1111-4111-8111-111111111111");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://arin-x.lovable.app/og-image.png");
  });

  it("rejects malformed thumbnail ids instead of doing a DB lookup", async () => {
    const res = await handleSeoRequest(
      new Request("https://arin-x.lovable.app/media/thumbnail/not%20a%20valid%20id"),
    );
    expect(res).toBeNull();
  });

  it("accepts a bounded CSP violation report and rejects other methods", async () => {
    const report = JSON.stringify({
      "csp-report": {
        "violated-directive": "script-src",
        "blocked-uri": "https://evil.example/x.js",
        "document-uri": "https://arin-x.lovable.app/watch/abc",
      },
    });
    const post = await serverFetch(
      new Request("https://arin-x.lovable.app/csp-report", { method: "POST", body: report }),
      {},
      {},
    );
    expect(post.status).toBe(204);
    expect(post.headers.get("cache-control")).toBe("no-store");
    const getReport = await get("/csp-report");
    expect(getReport.status).toBe(405);
  });
});
