/**
 * Canonical origin for the published site.
 *
 * Preview/dev hosts are deliberately NOT used here: every canonical URL,
 * Open Graph URL and sitemap entry points at the production origin so preview
 * surfaces never create duplicate content or split ranking signals.
 */
export const SITE_URL = "https://arin-x.lovable.app";
export const SITE_NAME = "ArinX";
export const SITE_TAGLINE = "Watch, share and create videos";
export const DEFAULT_DESCRIPTION =
  "ArinX is a free, open-source video platform to watch, share and create videos, Shorts and channels — music, gaming, tech, cooking, travel and more.";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

/** Public, indexable category landing pages used by the sitemap and nav. */
export const PUBLIC_CATEGORIES = [
  "Music",
  "Gaming",
  "Tech",
  "Cooking",
  "Travel",
  "Science",
  "Sports",
  "Film",
  "Comedy",
  "Education",
  "Other",
] as const;

/** Turns an absolute or root-relative URL into an absolute production URL. */
export function absoluteUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  if (/^http:\/\//i.test(trimmed)) return undefined; // never emit insecure URLs in metadata
  if (trimmed.startsWith("/")) return `${SITE_URL}${trimmed}`;
  return undefined;
}

/** Canonical URL for a path (drops query strings and fragments). */
export function canonicalUrl(path: string): string {
  const clean = (path.split(/[?#]/)[0] ?? "/").trim() || "/";
  return `${SITE_URL}${clean.startsWith("/") ? clean : `/${clean}`}`;
}

/** Stable, non-expiring image URL. The server redirects to a fresh signed URL. */
export function thumbnailProxyUrl(id: string): string {
  return `${SITE_URL}/media/thumbnail/${encodeURIComponent(id)}`;
}

export function watchPath(id: string): string {
  return `/watch/${encodeURIComponent(id)}`;
}
export function channelPath(handle: string): string {
  return `/channel/${encodeURIComponent(handle)}`;
}
export function categoryPath(category: string): string {
  return `/category/${encodeURIComponent(category.trim().toLowerCase())}`;
}
export function embedPath(id: string): string {
  return `/embed/${encodeURIComponent(id)}`;
}
