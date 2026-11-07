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

Sitemap: ${siteUrl}/sitemap.xml
`;
}
