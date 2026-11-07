import type { Channel, Video } from "@/lib/api";
import { absoluteUrl, channelPath, SITE_URL, thumbnailProxyUrl, watchPath } from "@/lib/site";

/** Serialisable payload returned by the public catalog server function. */
export interface Catalog {
  videos: Video[];
  channels: Channel[];
  generatedAt: number;
  /** True only when explicitly enabled for local/offline previews. */
  demo: boolean;
}

export interface PublicVideoMeta {
  kind: "video";
  id: string;
  title: string;
  description: string;
  uploaded: string | null;
  duration: number;
  views: number;
  category: string;
  tags: string[];
  handle: string;
  channelName: string;
  thumbnail: string;
  isShort: boolean;
}

export interface PublicChannelMeta {
  kind: "channel";
  /** Profile UUID, so SSR-rendered subscribe buttons target the right row. */
  id: string;
  handle: string;
  title: string;
  description: string;
  uploaded: string | null;
  duration: number;
  subscribers: number;
  joined: string | null;
  avatar: string | null;
  recentVideos: PublicVideoMeta[];
}

export type PublicContent = PublicVideoMeta | PublicChannelMeta;

/**
 * Builds a full Video object from crawl-safe public metadata. Used as React
 * Query `initialData` so the watch page renders real content during SSR even
 * though the interactive data is loaded client-side. The signed media path is
 * filled in by the client refetch.
 */
export function videoFromMeta(meta: PublicVideoMeta): Video {
  const channel: Channel = {
    id: meta.handle,
    name: meta.channelName,
    handle: meta.handle,
    avatar: null,
    banner: null,
    avatarPath: null,
    bannerPath: null,
    subscribers: 0,
    bio: "",
    location: "",
    joined: meta.uploaded ?? new Date(0).toISOString(),
    links: [],
  };
  return {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    channelId: meta.handle,
    channel,
    videoPath: "",
    thumbnail: meta.thumbnail.startsWith("data:")
      ? meta.thumbnail
      : (absoluteUrl(meta.thumbnail) ?? thumbnailProxyUrl(meta.id)),
    thumbnailPath: null,
    duration: meta.duration,
    views: meta.views,
    likes: 0,
    publishedAt: meta.uploaded ?? new Date(0).toISOString(),
    category: meta.category,
    tags: meta.tags,
    visibility: "public",
    isShort: meta.isShort,
    fingerprint: null,
  };
}

/**
 * Builds the same shape as `channelQuery()` from crawl-safe public metadata.
 * Used as React Query `initialData` so channel pages render their heading,
 * video grid and internal links in the first HTML response instead of a
 * loading skeleton. Signed media and social links arrive on the client refetch.
 */
export function channelDataFromMeta(meta: PublicChannelMeta): {
  channel: Channel;
  videos: Video[];
} {
  const channel: Channel = {
    id: meta.id,
    name: meta.title,
    handle: meta.handle,
    avatar: meta.avatar,
    banner: null,
    avatarPath: null,
    bannerPath: null,
    subscribers: meta.subscribers,
    bio: meta.description,
    location: "",
    joined: meta.joined ?? new Date(0).toISOString(),
    links: [],
  };
  const videos = meta.recentVideos.map((recent) => {
    const video = videoFromMeta(recent);
    return { ...video, channel, channelId: meta.id };
  });
  return { channel, videos };
}

export function videoUrl(id: string): string {
  return `${SITE_URL}${watchPath(id)}`;
}
export function channelUrl(handle: string): string {
  return `${SITE_URL}${channelPath(handle)}`;
}
export function videoEmbedUrl(id: string): string {
  return `${SITE_URL}/embed/${encodeURIComponent(id)}`;
}
export function videoThumbnailUrl(id: string): string {
  return thumbnailProxyUrl(id);
}
