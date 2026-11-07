import { DEMO_MODE, demoCatalog } from "@/lib/demo-data";
import { publicDbClient } from "@/lib/public-db";
import { buildRobotsTxt, buildSitemapXml, type SitemapEntry } from "@/lib/sitemap";
import {
  categoryPath,
  channelPath,
  PUBLIC_CATEGORIES,
  SITE_URL,
  thumbnailProxyUrl,
  watchPath,
} from "@/lib/site";
import { safeExternalUrl } from "@/lib/watch-tools";

/** Server-only. Never import from client components. */

type VideoRow = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  duration: number | null;
  views: number | null;
  tags: string[] | null;
  handle?: string | null;
};

function xmlResponse(body: string, cacheSeconds = 3600): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
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

function staticEntries(): SitemapEntry[] {
  const now = new Date().toISOString();
  return [
    { path: "/", lastmod: now, changefreq: "daily", priority: 1.0 },
    { path: "/trending", lastmod: now, changefreq: "hourly", priority: 0.9 },
    { path: "/shorts", lastmod: now, changefreq: "daily", priority: 0.8 },
    ...PUBLIC_CATEGORIES.map((category) => ({
      path: categoryPath(category),
      lastmod: now,
      changefreq: "daily" as const,
      priority: 0.7,
    })),
  ];
}

function videoEntry(row: VideoRow): SitemapEntry {
  return {
    path: watchPath(row.id),
    lastmod: row.created_at,
    changefreq: "weekly",
    priority: 0.7,
    video: {
      title: row.title,
      description: row.description || `Watch ${row.title} on ArinX.`,
      thumbnail: thumbnailProxyUrl(row.id),
      player: `${SITE_URL}/embed/${encodeURIComponent(row.id)}`,
      publishedAt: row.created_at,
      duration: Number(row.duration ?? 0),
      views: Number(row.views ?? 0),
      tags: Array.isArray(row.tags) ? row.tags.map(String).slice(0, 20) : [],
    },
  };
}

async function dynamicEntries(): Promise<SitemapEntry[]> {
  if (DEMO_MODE) {
    const catalog = demoCatalog();
    return [
      ...catalog.channels.map((c) => ({
        path: channelPath(c.handle),
        lastmod: c.joined,
        changefreq: "weekly" as const,
        priority: 0.6,
      })),
      ...catalog.videos.map((v) =>
        videoEntry({
          id: v.id,
          title: v.title,
          description: v.description,
          created_at: v.publishedAt,
          duration: v.duration,
          views: v.views,
          tags: v.tags,
          handle: v.channel.handle,
        }),
      ),
    ];
  }

  const client = publicDbClient();
  if (!client) return [];
  try {
    const [videos, channels] = await Promise.all([
      client
        .from("videos")
        .select(
          "id,title,description,created_at,duration,views,tags,profiles!videos_owner_id_fkey(handle)",
        )
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(1000),
      client.from("profiles").select("handle,created_at").limit(1000),
    ]);
    if (videos.error || channels.error) return [];

    const rows = (videos.data ?? []) as unknown as Array<
      Omit<VideoRow, "handle"> & { profiles?: { handle?: string } | null }
    >;
    const activeHandles = new Set(
      rows.map((r) => r.profiles?.handle).filter((h): h is string => !!h),
    );

    return [
      ...(channels.data ?? [])
        .filter((c) => activeHandles.has(c.handle))
        .map((c) => ({
          path: channelPath(c.handle),
          lastmod: c.created_at,
          changefreq: "weekly" as const,
          priority: 0.6,
        })),
      ...rows.map((r) => videoEntry({ ...r, handle: r.profiles?.handle ?? null })),
    ];
  } catch {
    return [];
  }
}

async function thumbnailResponse(id: string, requestUrl: URL): Promise<Response> {
  const fallback = new URL("/og-image.png", requestUrl.origin).href;
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
    const path = data.thumbnail_url as string;
    if (/^https?:\/\//i.test(path)) return redirect(safeExternalUrl(path) ?? fallback);
    const { data: signed } = await client.storage.from("thumbnails").createSignedUrl(path, 3600);
    return redirect(signed?.signedUrl ?? fallback);
  } catch {
    return redirect(fallback);
  }
}

/**
 * Handles SEO endpoints before the SSR router sees them:
 *  - /robots.txt           crawl directives + sitemap discovery
 *  - /sitemap.xml          dynamic, video-enabled sitemap
 *  - /media/thumbnail/:id  stable OG/JSON-LD image URL (fresh signed redirect)
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
    const entries = [...staticEntries(), ...(await dynamicEntries())];
    return xmlResponse(buildSitemapXml(entries));
  }
  const match = /^\/media\/thumbnail\/([A-Za-z0-9._-]{1,200})\/?$/.exec(url.pathname);
  if (match) return thumbnailResponse(match[1], url);
  return null;
}
