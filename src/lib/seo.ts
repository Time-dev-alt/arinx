import {
  absoluteUrl,
  canonicalUrl,
  categoryPath,
  channelPath,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  thumbnailProxyUrl,
  watchPath,
} from "@/lib/site";
import type { PublicChannelMeta, PublicVideoMeta } from "@/lib/catalog";
import { stripControlChars } from "@/lib/sanitize";

export type Ld = Record<string, unknown>;

export interface PageHeadOptions {
  /** Root-relative canonical path. Omit on pages that must not be indexed. */
  path?: string;
  noindex?: boolean;
  image?: string | null;
  type?: "website" | "video.other" | "profile";
  jsonLd?: Ld | Ld[];
  /** Override the automatically generated title. */
  fullTitle?: string;
}

const ROBOTS_INDEX = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const ROBOTS_NOINDEX = "noindex, nofollow, noimageindex, noarchive";

/** Keeps user-generated text safe and useful inside meta tags. */
export function cleanMetaText(value: string | null | undefined, max = 160): string {
  const text = stripControlChars(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function fullPageTitle(title: string): string {
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
}

/**
 * Complete, deduplicated document head for a route. TanStack Router merges
 * route-level `meta`/`links` with the root head, so canonicals, social cards
 * and robots directives live in one place.
 */
export function pageHead(
  title: string,
  description: string,
  pathOrOptions?: string | PageHeadOptions,
  extra: PageHeadOptions = {},
): { meta: Array<Record<string, unknown>>; links: Array<{ rel: string; href: string }> } {
  const opts: PageHeadOptions =
    typeof pathOrOptions === "string"
      ? { ...extra, path: pathOrOptions }
      : { ...extra, ...(pathOrOptions ?? {}) };
  const pageTitle = opts.fullTitle ?? fullPageTitle(cleanMetaText(title, 100));
  const desc = cleanMetaText(description || DEFAULT_DESCRIPTION, 160);
  const canonical = opts.path ? canonicalUrl(opts.path) : undefined;
  // Social crawlers only accept absolute http(s) image URLs. Demo thumbnails are
  // inline data URIs, so fall back to the branded card rather than emitting an
  // invalid og:image that Facebook/Google would discard.
  const image = (opts.image ? absoluteUrl(opts.image) : null) ?? DEFAULT_OG_IMAGE;
  const isVideo = opts.type === "video.other";
  const robots = opts.noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX;
  const ld = opts.jsonLd ? (Array.isArray(opts.jsonLd) ? opts.jsonLd : [opts.jsonLd]) : [];

  const meta: Array<Record<string, unknown>> = [
    { title: pageTitle },
    { name: "description", content: desc },
    { name: "robots", content: robots },
    { name: "googlebot", content: robots },
    // TanStack Router deduplicates <meta> by a single `name`/`property` key,
    // so a light+dark pair would silently collapse to one tag. Emit exactly one
    // valid theme-color and let `color-scheme` handle the OS preference.
    { name: "theme-color", content: "#0f0f0f" },
    { name: "color-scheme", content: "dark light" },
    { property: "og:title", content: pageTitle },
    { property: "og:description", content: desc },
    { property: "og:type", content: opts.type ?? "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "en_US" },
    { property: "og:image", content: image },
    ...(image === DEFAULT_OG_IMAGE
      ? [
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
        ]
      : []),
    { property: "og:image:alt", content: pageTitle },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: pageTitle },
    { name: "twitter:description", content: desc },
    { name: "twitter:image", content: image },
  ];
  if (canonical) {
    meta.push({ property: "og:url", content: canonical });
    meta.push({ name: "twitter:url", content: canonical });
  }
  for (const entry of ld) meta.push({ "script:ld+json": entry });

  return {
    meta,
    links: canonical && !opts.noindex ? [{ rel: "canonical", href: canonical }] : [],
  };
}

// --------------------------------------------------------------------------
// Schema.org structured data (rendered by TanStack Router as escaped ld+json)
// --------------------------------------------------------------------------

export function webSiteJsonLd(): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    inLanguage: "en-US",
    publisher: { "@id": `${SITE_URL}/#organization` },
    // NOTE: no SearchAction here. /results is intentionally noindex + Disallow
    // (duplicate/thin search pages), and Google retired the sitelinks searchbox
    // anyway — pointing structured data at a blocked URL is a contradiction.
  };
}

export function organizationJsonLd(): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      "@id": `${SITE_URL}/#logo`,
      url: `${SITE_URL}/logo.png`,
      contentUrl: `${SITE_URL}/logo.png`,
      width: 512,
      height: 512,
      caption: SITE_NAME,
    },
    image: { "@id": `${SITE_URL}/#logo` },
    description: DEFAULT_DESCRIPTION,
  };
}

export function isoDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${sec}S`;
}

export interface Chapter {
  start: number;
  title: string;
}

const CHAPTER_LINE = /^\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})\s*[–—\-:\s]\s*(.+?)\s*$/;

/** Pulls creator-written chapters ("0:00 Intro", "1:24 The feed") from a description. */
export function parseChapters(description: string | null | undefined): Chapter[] {
  if (!description) return [];
  const out: Chapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const match = CHAPTER_LINE.exec(line);
    if (!match) continue;
    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (!Number.isFinite(hours + minutes + seconds) || minutes > 59 || seconds > 59) continue;
    const start = hours * 3600 + minutes * 60 + seconds;
    const title = cleanMetaText(match[4], 90);
    if (!title) continue;
    if (out.length && start <= out[out.length - 1].start) continue;
    out.push({ start, title });
    if (out.length >= 25) break;
  }
  return out;
}

/**
 * Google key-moments markup, merged into the VideoObject. Requires at least
 * two chronological chapters; `hasPart` and `potentialAction` must live on the
 * VideoObject itself, not inside the action.
 */
export function chaptersJsonLd(meta: PublicVideoMeta, url: string): Ld | null {
  const chapters = parseChapters(meta.description);
  if (chapters.length < 2) return null;
  return {
    hasPart: chapters.map((chapter, i) => ({
      "@type": "Clip",
      "@id": `${url}#clip-${i + 1}`,
      name: chapter.title,
      startOffset: chapter.start,
      endOffset: chapters[i + 1]?.start ?? Math.max(chapter.start + 1, meta.duration || 0),
      url: `${url}?t=${chapter.start}`,
    })),
    potentialAction: {
      "@type": "SeekToAction",
      target: `${url}?t={seek_to_second_number}`,
      "startOffset-input": "required name=seek_to_second_number",
    },
  };
}

export function videoJsonLd(meta: PublicVideoMeta): Ld {
  const url = `${SITE_URL}${watchPath(meta.id)}`;
  const channelUrl = meta.handle ? `${SITE_URL}${channelPath(meta.handle)}` : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${url}#video`,
    name: cleanMetaText(meta.title, 120),
    description: cleanMetaText(meta.description || `Watch ${meta.title} on ${SITE_NAME}.`, 300),
    thumbnailUrl: [
      (meta.thumbnail ? absoluteUrl(meta.thumbnail) : null) ?? `${SITE_URL}/og-image.png`,
    ],
    uploadDate: meta.uploaded ?? undefined,
    duration: meta.duration > 0 ? isoDuration(meta.duration) : undefined,
    embedUrl: `${SITE_URL}/embed/${encodeURIComponent(meta.id)}`,
    contentUrl: url,
    url,
    inLanguage: "en-US",
    isAccessibleForFree: true,
    genre: meta.category || undefined,
    keywords: meta.tags?.length ? meta.tags.join(", ") : undefined,
    publisher: { "@id": `${SITE_URL}/#organization` },
    ...(meta.channelName
      ? {
          author: {
            "@type": "Person",
            name: meta.channelName,
            ...(channelUrl ? { url: channelUrl } : {}),
          },
        }
      : {}),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/WatchAction",
      userInteractionCount: Math.max(0, meta.views || 0),
    },
    ...(chaptersJsonLd(meta, url) ?? {}),
  };
}

export function channelJsonLd(meta: PublicChannelMeta): Ld {
  const url = `${SITE_URL}${channelPath(meta.handle)}`;
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${url}#profile`,
    url,
    name: cleanMetaText(meta.title, 120),
    description: cleanMetaText(meta.description, 300),
    dateCreated: meta.joined ?? undefined,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntity: {
      "@type": "Person",
      "@id": `${url}#person`,
      name: meta.title,
      identifier: `@${meta.handle}`,
      url,
      ...(meta.avatar && absoluteUrl(meta.avatar) ? { image: absoluteUrl(meta.avatar) } : {}),
      ...(meta.subscribers
        ? {
            interactionStatistic: {
              "@type": "InteractionCounter",
              interactionType: "https://schema.org/SubscribeAction",
              userInteractionCount: meta.subscribers,
            },
          }
        : {}),
    },
  };
}

export function itemListJsonLd(
  items: Array<{ id: string; title: string }>,
  name: string,
  url: string,
): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 30).map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.title,
      url: `${SITE_URL}${watchPath(item.id)}`,
    })),
  };
}

export interface CarouselVideo {
  id: string;
  title: string;
  description?: string | null;
  thumbnail?: string | null;
  duration?: number;
  publishedAt?: string;
  views?: number;
}

/**
 * Rich ItemList for home/category/trending pages. Each ListItem carries a full
 * VideoObject, which is what Google's video carousel / LCP carousel guidance
 * expects — a bare ListItem with only a name and URL is not enough.
 */
export function videoCarouselJsonLd(videos: CarouselVideo[], name: string, url: string): Ld {
  const items = videos.slice(0, 30);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${url}#videos`,
    name,
    url,
    numberOfItems: items.length,
    itemListElement: items.map((video, i) => {
      const watch = `${SITE_URL}${watchPath(video.id)}`;
      const thumbnail =
        (video.thumbnail ? absoluteUrl(video.thumbnail) : null) ?? thumbnailProxyUrl(video.id);
      return {
        "@type": "ListItem",
        position: i + 1,
        url: watch,
        item: {
          "@type": "VideoObject",
          "@id": `${watch}#video`,
          name: cleanMetaText(video.title, 120),
          description: cleanMetaText(
            video.description || `Watch ${video.title} on ${SITE_NAME}.`,
            300,
          ),
          thumbnailUrl: [thumbnail],
          uploadDate: video.publishedAt ?? undefined,
          duration: video.duration && video.duration > 0 ? isoDuration(video.duration) : undefined,
          embedUrl: `${SITE_URL}/embed/${encodeURIComponent(video.id)}`,
          contentUrl: watch,
          url: watch,
          isAccessibleForFree: true,
          publisher: { "@id": `${SITE_URL}/#organization` },
        },
      };
    }),
  };
}

export function breadcrumbJsonLd(crumbs: Array<{ name: string; path: string }>): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: canonicalUrl(crumb.path),
    })),
  };
}

export function categoryJsonLd(category: string, count: number): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${category} videos on ${SITE_NAME}`,
    url: canonicalUrl(categoryPath(category)),
    description: `Browse ${count} ${category.toLowerCase()} videos on ${SITE_NAME}.`,
    isPartOf: { "@id": `${SITE_URL}/#website` },
  };
}
