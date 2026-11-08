import { SITE_URL } from "@/lib/site";

export interface SitemapVideo {
  title: string;
  description: string;
  thumbnail: string;
  player: string;
  publishedAt?: string | null;
  duration: number;
  views: number;
  tags?: string[];
}

export interface SitemapEntry {
  path: string;
  lastmod?: string | null;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";
  priority?: number;
  video?: SitemapVideo;
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return char;
    }
  });
}

function isoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

/** Builds a standards-compliant urlset with Google's video sitemap extension. */
export function buildSitemapXml(entries: SitemapEntry[], siteUrl = SITE_URL): string {
  const seen = new Set<string>();
  const urls = entries
    .filter((entry) => {
      if (!entry.path.startsWith("/") || seen.has(entry.path)) return false;
      seen.add(entry.path);
      return true;
    })
    .map((entry) => {
      const loc = `${siteUrl}${entry.path}`;
      const parts = [`  <url>`, `    <loc>${escapeXml(loc)}</loc>`];
      const lastmod = isoDate(entry.lastmod);
      if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (typeof entry.priority === "number") {
        parts.push(
          `    <priority>${Math.max(0, Math.min(1, entry.priority)).toFixed(1)}</priority>`,
        );
      }
      if (entry.video) {
        const v = entry.video;
        parts.push(
          `    <video:video>`,
          `      <video:thumbnail_loc>${escapeXml(v.thumbnail)}</video:thumbnail_loc>`,
          `      <video:title>${escapeXml(v.title.slice(0, 100))}</video:title>`,
          `      <video:description>${escapeXml(v.description.slice(0, 2048))}</video:description>`,
          `      <video:player_loc allow_embed="yes">${escapeXml(v.player)}</video:player_loc>`,
        );
        if (v.duration > 0)
          parts.push(
            `      <video:duration>${Math.max(1, Math.min(28800, Math.round(v.duration)))}</video:duration>`,
          );
        const published = isoDate(v.publishedAt);
        if (published)
          parts.push(`      <video:publication_date>${published}</video:publication_date>`);
        if (v.views > 0)
          parts.push(`      <video:view_count>${Math.round(v.views)}</video:view_count>`);
        if (v.tags?.length)
          parts.push(
            `      <video:tag>${escapeXml(v.tags.slice(0, 20).join(", ").slice(0, 256))}</video:tag>`,
          );
        parts.push(
          `      <video:family_friendly>yes</video:family_friendly>`,
          `    </video:video>`,
        );
      }
      parts.push(`  </url>`);
      return parts.join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${urls}\n</urlset>\n`;
}

/** Escapes text destined for XML character data (including CDATA terminators). */
export function cdata(value: string): string {
  return escapeXml(value).replace(/]]>/g, "]]&gt;");
}

export interface SitemapIndexEntry {
  loc: string;
  lastmod?: string | null;
}

/** Sitemaps are capped at 50k URLs / 50 MB; large catalogs are split by page. */
export function buildSitemapIndexXml(entries: SitemapIndexEntry[], siteUrl = SITE_URL): string {
  const seen = new Set<string>();
  const items = entries
    .filter((entry) => {
      const loc = entry.loc.startsWith("http") ? entry.loc : `${siteUrl}${entry.loc}`;
      if (seen.has(loc)) return false;
      seen.add(loc);
      return true;
    })
    .map((entry) => {
      const loc = entry.loc.startsWith("http") ? entry.loc : `${siteUrl}${entry.loc}`;
      const parts = [`  <sitemap>`, `    <loc>${escapeXml(loc)}</loc>`];
      const lastmod = isoDate(entry.lastmod);
      if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
      parts.push(`  </sitemap>`);
      return parts.join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  path: string;
  publishedAt?: string | null;
  thumbnail?: string | null;
  player?: string | null;
  duration?: number;
  author?: string | null;
}

function rfc822(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  return (Number.isNaN(date.getTime()) ? new Date() : date).toUTCString();
}

/** RSS 2.0 + Media RSS, for feed readers and additional discovery surfaces. */
export function buildRssFeed(items: FeedItem[], siteUrl = SITE_URL): string {
  const entries = items
    .slice(0, 50)
    .map((item) => {
      const link = `${siteUrl}${item.path}`;
      const parts = [
        `    <item>`,
        `      <title>${escapeXml(item.title.slice(0, 200))}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${escapeXml(rfc822(item.publishedAt))}</pubDate>`,
        `      <description>${cdata(item.description.slice(0, 2000))}</description>`,
      ];
      if (item.author) parts.push(`      <author>${escapeXml(item.author.slice(0, 120))}</author>`);
      if (item.thumbnail) {
        parts.push(`      <media:thumbnail url="${escapeXml(item.thumbnail)}" />`);
      }
      if (item.player) {
        parts.push(`      <media:player url="${escapeXml(item.player)}" />`);
      }
      if (item.duration && item.duration > 0) {
        parts.push(
          `      <media:content url="${escapeXml(item.player ?? link)}" duration="${Math.round(item.duration)}" medium="video" />`,
        );
      }
      parts.push(`    </item>`);
      return parts.join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">\n  <channel>\n    <title>ArinX — latest videos</title>\n    <link>${escapeXml(siteUrl)}</link>\n    <description>New public videos, Shorts and creator uploads from ArinX.</description>\n    <language>en-US</language>\n    <lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>\n    <ttl>60</ttl>\n    <atom:link href="${escapeXml(`${siteUrl}/feed.xml`)}" rel="self" type="application/rss+xml" />\n${entries}\n  </channel>\n</rss>\n`;
}

export function buildRobotsTxt(siteUrl = SITE_URL): string {
  return `# ${siteUrl} — robots.txt
# Only private surfaces and duplicate search results are blocked. Public watch
# pages, embed players and thumbnail redirects stay reachable: Google needs the
# player and image referenced by the video sitemap for video rich results, and
# social crawlers need them for link previews. Embed pages carry a noindex tag
# instead of a robots.txt block, which keeps them out of the index while still
# letting crawlers verify the player.
User-agent: *
Allow: /
Disallow: /admin
Disallow: /auth
Disallow: /studio
Disallow: /library
Disallow: /history
Disallow: /playlist/
Disallow: /results
Disallow: /api/

# Feeds and sitemap shards are public discovery surfaces.
Allow: /feed.xml
Allow: /sitemap-videos.xml
Allow: /sitemap-pages.xml
Allow: /sitemap-channels.xml

Sitemap: ${siteUrl}/sitemap.xml
`;
}
