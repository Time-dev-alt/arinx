import { createServerFn } from "@tanstack/react-start";
import type { Channel, Video } from "@/lib/api";
import type { Catalog } from "@/lib/catalog";
import { DEMO_MODE, demoCatalog } from "@/lib/demo-data";
import { publicDbClient } from "@/lib/public-db";
import { safeExternalUrl } from "@/lib/watch-tools";

type ProfileRow = {
  id: string;
  name: string;
  handle: string;
  bio: string | null;
  location: string | null;
  created_at: string;
  subscriber_count: number | null;
  avatar_url: string | null;
  banner_url: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  x_url?: string | null;
  discord_url?: string | null;
};

type VideoRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  is_short: boolean | null;
  video_path: string;
  thumbnail_url: string | null;
  duration: number | null;
  views: number | null;
  likes: number | null;
  created_at: string;
  profiles: ProfileRow | null;
};

const SIGN_TTL = 60 * 60 * 24;

async function signMap(
  client: NonNullable<ReturnType<typeof publicDbClient>>,
  bucket: string,
  paths: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const unique = [
    ...new Set(
      paths.filter((p): p is string => !!p && !p.startsWith("http") && !p.startsWith("data:")),
    ),
  ].slice(0, 300);
  const out: Record<string, string> = {};
  if (!unique.length) return out;
  const { data } = await client.storage.from(bucket).createSignedUrls(unique, SIGN_TTL);
  for (const item of data ?? []) if (item.signedUrl && item.path) out[item.path] = item.signedUrl;
  return out;
}

const pick = (map: Record<string, string>, path: string | null) =>
  !path ? null : path.startsWith("http") || path.startsWith("data:") ? path : (map[path] ?? null);

function toChannel(p: ProfileRow, art: Record<string, string>): Channel {
  return {
    id: p.id,
    name: p.name,
    handle: p.handle,
    bio: p.bio ?? "",
    location: p.location ?? "",
    avatar: pick(art, p.avatar_url),
    banner: pick(art, p.banner_url),
    avatarPath: p.avatar_url,
    bannerPath: p.banner_url,
    subscribers: Number(p.subscriber_count ?? 0),
    joined: p.created_at,
    links: (
      [
        ["Website", p.website_url],
        ["Instagram", p.instagram_url],
        ["X", p.x_url],
        ["Discord", p.discord_url],
      ] as const
    ).flatMap(([label, value]) => {
      const url = safeExternalUrl(value);
      return url ? [{ label, url }] : [];
    }),
  };
}

function emptyCatalog(): Catalog {
  return { videos: [], channels: [], generatedAt: Date.now(), demo: false };
}

/**
 * Public, crawlable video feed used as SSR `initialData` so search engines
 * receive real titles, links and structured data on the first HTML response.
 * Only `visibility = public` rows are ever selected.
 */
export const publicCatalog = createServerFn({ method: "GET" })
  .validator((raw: unknown): { limit: number } => {
    const value =
      raw && typeof raw === "object" && "limit" in raw
        ? Number((raw as { limit: unknown }).limit)
        : 48;
    return {
      limit: Number.isFinite(value) ? Math.min(100, Math.max(1, Math.floor(value))) : 48,
    };
  })
  .handler(async ({ data }): Promise<Catalog> => {
    if (DEMO_MODE) return demoCatalog();
    const client = publicDbClient();
    if (!client) return emptyCatalog();

    try {
      const { data: rows, error } = await client
        .from("videos")
        .select("*, profiles!videos_owner_id_fkey(*)")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (error || !rows) return emptyCatalog();

      const typed = rows as unknown as VideoRow[];
      const [thumbs, art] = await Promise.all([
        signMap(
          client,
          "thumbnails",
          typed.map((r) => r.thumbnail_url),
        ),
        signMap(
          client,
          "channel-art",
          typed.flatMap((r) => [r.profiles?.avatar_url, r.profiles?.banner_url]),
        ),
      ]);

      const channels = new Map<string, Channel>();
      for (const row of typed) {
        if (row.profiles && !channels.has(row.profiles.id)) {
          channels.set(row.profiles.id, toChannel(row.profiles, art));
        }
      }

      const videos: Video[] = typed
        .filter((r) => r.profiles)
        .map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description ?? "",
          channelId: r.owner_id,
          channel: channels.get(r.owner_id)!,
          videoPath: r.video_path,
          thumbnail: pick(thumbs, r.thumbnail_url),
          thumbnailPath: r.thumbnail_url,
          duration: Number(r.duration ?? 0),
          views: Number(r.views ?? 0),
          likes: Number(r.likes ?? 0),
          publishedAt: r.created_at,
          category: r.category ?? "Other",
          tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
          visibility: "public",
          isShort: !!r.is_short,
          fingerprint: null,
        }));

      return {
        videos,
        channels: [...channels.values()],
        generatedAt: Date.now(),
        demo: false,
      };
    } catch {
      // Never fail SSR (and therefore never serve a 500 to a crawler).
      return emptyCatalog();
    }
  });
