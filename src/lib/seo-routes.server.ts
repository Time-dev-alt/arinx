import { DEMO_MODE, demoCatalog } from "@/lib/demo-data";
import { publicDbClient } from "@/lib/public-db";
import {
  buildRssFeed,
  buildRobotsTxt,
  buildSitemapIndexXml,
  buildSitemapXml,
  type FeedItem,
  type SitemapEntry,
} from "@/lib/sitemap";
import {
  categoryPath,
  channelPath,
  PUBLIC_CATEGORIES,
  SITE_URL,
  thumbnailProxyUrl,
  watchPath,
} from "@/lib/site";
import { safeStorageObjectPath } from "@/lib/watch-tools";
import {
  clientKeyFromRequest,
  LIMITS,
  rateLimitedResponse,
  type RateLimitRule,
} from "@/lib/rate-limit";
import { checkRateLimit } from "@/lib/rate-limit-backend";

/** Server-only. Never import from client components. */

const PAGE_SIZE = 500;
const MAX_PAGES = 100;

type RawVideoRow = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  duration: number | null;
  views: number | null;
  tags: string[] | null;
  profiles?: { handle?: string } | null;
};

function xmlResponse(body: string, cacheSeconds = 3600, contentType = "application/xml"): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": `${contentType}; charset=utf-8`,
      "cache-control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
      "x-content-type-options": "nosniff",
    },
  });
}

function textResponse(body: string, contentType: string, cacheSeconds = 3600): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": `${contentType}; charset=utf-8`,
      "cache-control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
      "x-content-type-options": "nosniff",
    },
  });
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "public, max-age=1800",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Returns a 429 Response when a client has exhausted its budget. */
async function guard(
  request: Request,
  bucket: string,
  rule: RateLimitRule,
): Promise<Response | null> {
  const result = await checkRateLimit(`${bucket}:${clientKeyFromRequest(request)}`, rule);
  return result.allowed ? null : rateLimitedResponse(result);
}

function staticEntries(): SitemapEntry[] {
  // No synthetic `lastmod`: stamping every static URL with "now" on each
  // crawl is a low-quality freshness signal Google explicitly warns about.
  // Real lastmod values come from video/channel rows below.
  return [
    { path: "/", changefreq: "daily", priority: 1.0 },
    { path: "/trending", changefreq: "hourly", priority: 0.9 },
    { path: "/shorts", changefreq: "daily", priority: 0.8 },
    ...PUBLIC_CATEGORIES.map((category) => ({
      path: categoryPath(category),
      changefreq: "daily" as const,
      priority: 0.7,
    })),
  ];
}

function videoEntry(row: RawVideoRow): SitemapEntry {
  const title = String(row.title ?? "").slice(0, 200);
  return {
    path: watchPath(row.id),
    lastmod: row.created_at,
    changefreq: "weekly",
    priority: 0.7,
    video: {
      title,
      description: (row.description || `Watch ${title} on ArinX.`).slice(0, 2048),
      thumbnail: thumbnailProxyUrl(row.id),
      player: `${SITE_URL}/embed/${encodeURIComponent(row.id)}`,
      publishedAt: row.created_at,
      duration: Number(row.duration ?? 0),
      views: Number(row.views ?? 0),
      tags: Array.isArray(row.tags) ? row.tags.map(String).slice(0, 20) : [],
    },
  };
}

function demoRows(): RawVideoRow[] {
  return demoCatalog().videos.map((v) => ({
    id: v.id,
    title: v.title,
    description: v.description,
    created_at: v.publishedAt,
    duration: v.duration,
    views: v.views,
    tags: v.tags,
    profiles: { handle: v.channel.handle },
  }));
}

async function fetchVideoRows(from: number, to: number): Promise<RawVideoRow[]> {
  if (DEMO_MODE) return demoRows().slice(from, to + 1);
  const client = publicDbClient();
  if (!client) return [];
  const { data, error } = await client
    .from("videos")
    .select(
      "id,title,description,created_at,duration,views,tags,profiles!videos_owner_id_fkey(handle)",
    )
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error || !data) return [];
  return data as unknown as RawVideoRow[];
}

async function fetchChannelRows(): Promise<Array<{ handle: string; created_at: string }>> {
  if (DEMO_MODE) {
    return demoCatalog().channels.map((c) => ({ handle: c.handle, created_at: c.joined }));
  }
  const client = publicDbClient();
  if (!client) return [];
  const { data, error } = await client
    .from("profiles")
    .select("handle,created_at")
    .not("handle", "is", null)
    .limit(1000);
  if (error || !data) return [];
  return data as Array<{ handle: string; created_at: string }>;
}

async function countPublicVideos(): Promise<number> {
  if (DEMO_MODE) return demoRows().length;
  const client = publicDbClient();
  if (!client) return 0;
  const { count, error } = await client
    .from("videos")
    .select("*", { count: "exact", head: true })
    .eq("visibility", "public");
  return error || !count ? 0 : count;
}

function channelEntries(rows: Array<{ handle: string; created_at: string }>): SitemapEntry[] {
  return rows
    .filter((row) => /^[A-Za-z0-9._-]{1,100}$/.test(row.handle))
    .map((row) => ({
      path: channelPath(row.handle),
      lastmod: row.created_at,
      changefreq: "weekly" as const,
      priority: 0.6,
    }));
}

function feedItems(rows: RawVideoRow[]): FeedItem[] {
  return rows.slice(0, 50).map((row) => ({
    id: row.id,
    title: String(row.title ?? "Untitled video"),
    description: row.description || `Watch ${row.title} on ArinX.`,
    path: watchPath(row.id),
    publishedAt: row.created_at,
    thumbnail: thumbnailProxyUrl(row.id),
    player: `${SITE_URL}/embed/${encodeURIComponent(row.id)}`,
    duration: Number(row.duration ?? 0),
    author: row.profiles?.handle ? `@${row.profiles.handle}` : null,
  }));
}

async function thumbnailResponse(id: string): Promise<Response> {
  // The fallback must be the canonical production origin — a dev/preview
  // request origin would put http://localhost URLs into the sitemap and OG
  // tags that crawlers fetch later.
  const fallback = new URL("/og-image.png", SITE_URL).href;
  if (DEMO_MODE) return redirect(fallback);
  const client = publicDbClient();
  if (!client) return redirect(fallback);
  try {
    const { data, error } = await client
      .from("videos")
      .select("thumbnail_url")
      .eq("id", id)
      .eq("visibility", "public")
      .maybeSingle();
    if (error || !data?.thumbnail_url) return redirect(fallback);
    // Thumbnails are stored in our private bucket. Never turn creator-supplied
    // external URLs into redirects from this trusted crawler endpoint.
    const path = safeStorageObjectPath(data.thumbnail_url);
    if (!path) return redirect(fallback);
    const { data: signed } = await client.storage.from("thumbnails").createSignedUrl(path, 3600);
    return redirect(signed?.signedUrl ?? fallback);
  } catch {
    return redirect(fallback);
  }
}

/**
 * Handles SEO endpoints before the SSR router sees them:
 *  - /robots.txt               crawl directives + sitemap discovery
 *  - /sitemap.xml              urlset for small catalogs, index for large ones
 *  - /sitemap-{pages,videos,channels}.xml  shards (paginated when needed)
 *  - /feed.xml                 RSS 2.0 + Media RSS
 *  - /media/thumbnail/:id      stable OG/JSON-LD image URL
 */
export async function handleSeoRequest(request: Request): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }

  if (url.pathname === "/robots.txt") {
    return textResponse(buildRobotsTxt(), "text/plain");
  }

  if (url.pathname === "/sitemap.xml") {
    const blocked = await guard(request, "sitemap", LIMITS.sitemap);
    if (blocked) return blocked;
    const count = await countPublicVideos();
    const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(count / PAGE_SIZE)));
    if (pages > 1) {
      const newest = await fetchVideoRows(0, 0);
      const lastmod = newest[0]?.created_at ?? null;
      return xmlResponse(
        buildSitemapIndexXml([
          { loc: "/sitemap-pages.xml" },
          ...Array.from({ length: pages }, (_, i) => ({
            loc: `/sitemap-videos.xml?page=${i + 1}`,
            lastmod,
          })),
          { loc: "/sitemap-channels.xml" },
        ]),
      );
    }
    const [rows, channels] = await Promise.all([
      fetchVideoRows(0, PAGE_SIZE - 1),
      fetchChannelRows(),
    ]);
    return xmlResponse(
      buildSitemapXml([...staticEntries(), ...channelEntries(channels), ...rows.map(videoEntry)]),
    );
  }

  if (url.pathname === "/sitemap-pages.xml") {
    const blocked = await guard(request, "sitemap", LIMITS.sitemap);
    if (blocked) return blocked;
    return xmlResponse(buildSitemapXml(staticEntries()));
  }

  if (url.pathname === "/sitemap-channels.xml") {
    const blocked = await guard(request, "sitemap", LIMITS.sitemap);
    if (blocked) return blocked;
    return xmlResponse(buildSitemapXml(channelEntries(await fetchChannelRows())));
  }

  if (url.pathname === "/sitemap-videos.xml") {
    const blocked = await guard(request, "sitemap", LIMITS.sitemap);
    if (blocked) return blocked;
    const raw = Number(url.searchParams.get("page") ?? "1");
    const page = Number.isFinite(raw) ? Math.min(MAX_PAGES, Math.max(1, Math.floor(raw))) : 1;
    const rows = await fetchVideoRows((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    return xmlResponse(buildSitemapXml(rows.map(videoEntry)));
  }

  if (url.pathname === "/feed.xml") {
    const blocked = await guard(request, "sitemap", LIMITS.sitemap);
    if (blocked) return blocked;
    return xmlResponse(
      buildRssFeed(feedItems(await fetchVideoRows(0, 49))),
      900,
      "application/rss+xml",
    );
  }

  const match = /^\/media\/thumbnail\/([A-Za-z0-9._-]{1,200})\/?$/.exec(url.pathname);
  if (match) {
    const blocked = await guard(request, "thumb", LIMITS.thumbnail);
    if (blocked) return blocked;
    return thumbnailResponse(match[1]);
  }
  return null;
}
