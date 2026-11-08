import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { safeExternalUrl } from "@/lib/watch-tools";
import { sanitizeSearchTerm } from "@/lib/sanitize";

export type Visibility = "public" | "unlisted" | "private";

export interface Channel {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
  banner: string | null;
  avatarPath: string | null;
  bannerPath: string | null;
  subscribers: number;
  bio: string;
  location: string;
  joined: string;
  links: { label: string; url: string }[];
}

export interface Video {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channel: Channel;
  videoPath: string;
  thumbnail: string | null;
  thumbnailPath: string | null;
  duration: number;
  views: number;
  likes: number;
  publishedAt: string;
  category: string;
  tags: string[];
  visibility: Visibility;
  isShort: boolean;
  fingerprint?: string | null;
}

export interface Comment {
  id: string;
  videoId: string;
  parentId: string | null;
  userId: string;
  author: Channel;
  text: string;
  likes: number;
  createdAt: string;
}

export const CATEGORIES = [
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
];

// ---------- media signing (buckets are private) ----------
const SIGN_TTL = 60 * 60 * 24;
async function signMany(bucket: string, paths: (string | null | undefined)[]) {
  const unique = [
    ...new Set(
      paths.filter((p): p is string => !!p && !p.startsWith("http") && !p.startsWith("data:")),
    ),
  ];
  const out: Record<string, string> = {};
  if (!unique.length) return out;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, SIGN_TTL);
  for (const d of data ?? []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
  return out;
}
const pick = (map: Record<string, string>, p: string | null) =>
  !p ? null : p.startsWith("http") ? p : (map[p] ?? null);

type ProfileRow = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  location: string;
  avatar_url: string | null;
  banner_url: string | null;
  subscriber_count: number;
  created_at: string;
  website_url?: string | null;
  instagram_url?: string | null;
  x_url?: string | null;
  discord_url?: string | null;
};
type VideoRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  visibility: string;
  is_short: boolean;
  video_path: string;
  thumbnail_url: string | null;
  duration: number;
  views: number;
  likes: number;
  created_at: string;
  profiles: ProfileRow | null;
  watermark_fingerprint?: string | null;
};

function toChannel(p: ProfileRow, art: Record<string, string>): Channel {
  return {
    id: p.id,
    name: p.name,
    handle: p.handle,
    bio: p.bio,
    location: p.location,
    avatarPath: p.avatar_url,
    bannerPath: p.banner_url,
    avatar: pick(art, p.avatar_url),
    banner: pick(art, p.banner_url),
    subscribers: p.subscriber_count,
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

async function hydrateChannels(rows: ProfileRow[]) {
  const art = await signMany(
    "channel-art",
    rows.flatMap((r) => [r.avatar_url, r.banner_url]),
  );
  return rows.map((r) => toChannel(r, art));
}

async function hydrateVideos(rows: VideoRow[]): Promise<Video[]> {
  const [thumbs, art] = await Promise.all([
    signMany(
      "thumbnails",
      rows.map((r) => r.thumbnail_url),
    ),
    signMany(
      "channel-art",
      rows.flatMap((r) => [r.profiles?.avatar_url, r.profiles?.banner_url]),
    ),
  ]);
  return rows
    .filter((r) => r.profiles)
    .map((r) => ({
      fingerprint: r.watermark_fingerprint,
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      tags: r.tags ?? [],
      visibility: r.visibility as Visibility,
      isShort: r.is_short,
      videoPath: r.video_path,
      thumbnailPath: r.thumbnail_url,
      thumbnail: pick(thumbs, r.thumbnail_url),
      duration: r.duration,
      views: Number(r.views),
      likes: r.likes,
      publishedAt: r.created_at,
      channelId: r.owner_id,
      channel: toChannel(r.profiles!, art),
    }));
}

const VIDEO_SELECT = "*, profiles!videos_owner_id_fkey(*)";

// ---------- queries ----------
export const publicVideosQuery = () =>
  queryOptions({
    queryKey: ["videos", "public"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select(VIDEO_SELECT)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return hydrateVideos(data as unknown as VideoRow[]);
    },
  });

export const videoQuery = (id: string) =>
  queryOptions({
    queryKey: ["video", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select(VIDEO_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? ((await hydrateVideos([data as unknown as VideoRow]))[0] ?? null) : null;
    },
  });

export const videosByIdsQuery = (ids: string[]) =>
  queryOptions({
    queryKey: ["videos", "ids", ids],
    queryFn: async () => {
      if (!ids.length) return [] as Video[];
      const { data, error } = await supabase.from("videos").select(VIDEO_SELECT).in("id", ids);
      if (error) throw error;
      const vids = await hydrateVideos(data as unknown as VideoRow[]);
      const byId = new Map(vids.map((v) => [v.id, v]));
      return ids.map((i) => byId.get(i)).filter(Boolean) as Video[];
    },
  });

/**
 * Channel pages must never receive unlisted/private metadata: RLS allows
 * unlisted rows for any visitor, but only published uploads belong in a
 * public response. Studio explicitly opts in to the owner's full list.
 */
export const channelQuery = (handle: string, options: { includePrivate?: boolean } = {}) =>
  queryOptions({
    queryKey: ["channel", handle, !!options.includePrivate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("handle", handle)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [channel] = await hydrateChannels([data as ProfileRow]);
      let query = supabase
        .from("videos")
        .select(VIDEO_SELECT)
        .eq("owner_id", data.id)
        .order("created_at", { ascending: false });
      if (!options.includePrivate) query = query.eq("visibility", "public");
      const { data: vrows, error: e2 } = await query;
      if (e2) throw e2;
      return { channel: channel!, videos: await hydrateVideos(vrows as unknown as VideoRow[]) };
    },
  });

export const profileQuery = (id: string) =>
  queryOptions({
    queryKey: ["profile", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? (await hydrateChannels([data as ProfileRow]))[0]! : null;
    },
  });

export const channelsByIdsQuery = (ids: string[]) =>
  queryOptions({
    queryKey: ["channels", ids],
    queryFn: async () => {
      if (!ids.length) return [] as Channel[];
      const { data, error } = await supabase.from("profiles").select("*").in("id", ids);
      if (error) throw error;
      return hydrateChannels(data as ProfileRow[]);
    },
  });

export const searchChannelsQuery = (q: string) =>
  queryOptions({
    queryKey: ["channels", "search", q],
    queryFn: async () => {
      // Whitelist before interpolating into a PostgREST `or()` expression:
      // commas, parentheses, quotes, backslashes and wildcards can otherwise
      // break out of the intended filter (filter injection).
      const t = sanitizeSearchTerm(q);
      if (!t) return [] as Channel[];
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .or(`name.ilike.%${t}%,handle.ilike.%${t}%`)
        .limit(10);
      if (error) throw error;
      return hydrateChannels(data as ProfileRow[]);
    },
  });

export const commentsQuery = (videoId: string) =>
  queryOptions({
    queryKey: ["comments", videoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("*, profiles!comments_user_id_fkey(*)")
        .eq("video_id", videoId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = data as unknown as {
        id: string;
        video_id: string;
        parent_id: string | null;
        user_id: string;
        body: string;
        likes: number;
        created_at: string;
        profiles: ProfileRow;
      }[];
      const art = await signMany(
        "channel-art",
        rows.map((r) => r.profiles?.avatar_url),
      );
      return rows.map<Comment>((r) => ({
        id: r.id,
        videoId: r.video_id,
        parentId: r.parent_id,
        userId: r.user_id,
        text: r.body,
        likes: r.likes,
        createdAt: r.created_at,
        author: toChannel(r.profiles, art),
      }));
    },
  });

export interface UserData {
  liked: string[];
  disliked: string[];
  subscriptions: string[];
  watchLater: string[];
  history: { id: string; at: string }[];
  playlists: { id: string; name: string; createdAt: string; videoIds: string[] }[];
  likedComments: string[];
}
export const EMPTY_USER: UserData = {
  liked: [],
  disliked: [],
  subscriptions: [],
  watchLater: [],
  history: [],
  playlists: [],
  likedComments: [],
};

export const userDataQuery = (uid: string | undefined) =>
  queryOptions({
    queryKey: ["me", uid],
    enabled: !!uid,
    queryFn: async (): Promise<UserData> => {
      const [r, s, w, h, p, c] = await Promise.all([
        supabase.from("video_reactions").select("video_id, value"),
        supabase.from("subscriptions").select("channel_id"),
        supabase
          .from("watch_later")
          .select("video_id, added_at")
          .order("added_at", { ascending: false }),
        supabase
          .from("watch_history")
          .select("video_id, watched_at")
          .order("watched_at", { ascending: false })
          .limit(300),
        supabase
          .from("playlists")
          .select("id, name, created_at, playlist_items(video_id, added_at)")
          .order("created_at"),
        supabase.from("comment_likes").select("comment_id"),
      ]);
      for (const x of [r, s, w, h, p, c]) if (x.error) throw x.error;
      return {
        liked: (r.data ?? []).filter((x) => x.value === 1).map((x) => x.video_id),
        disliked: (r.data ?? []).filter((x) => x.value === -1).map((x) => x.video_id),
        subscriptions: (s.data ?? []).map((x) => x.channel_id),
        watchLater: (w.data ?? []).map((x) => x.video_id),
        history: (h.data ?? []).map((x) => ({ id: x.video_id, at: x.watched_at })),
        playlists: (p.data ?? []).map((x) => ({
          id: x.id,
          name: x.name,
          createdAt: x.created_at,
          videoIds: [...(x.playlist_items ?? [])]
            .sort((a, b) => +new Date(a.added_at) - +new Date(b.added_at))
            .map((i) => i.video_id),
        })),
        likedComments: (c.data ?? []).map((x) => x.comment_id),
      };
    },
  });

export async function signVideo(path: string) {
  if (!path || path.startsWith("http") || path.includes("..")) {
    throw new Error("Invalid media path");
  }
  const { data, error } = await supabase.storage.from("videos").createSignedUrl(path, SIGN_TTL);
  if (error) throw error;
  return data.signedUrl;
}
export const videoSrcQuery = (path: string) =>
  queryOptions({
    queryKey: ["src", path],
    staleTime: 60 * 60 * 1000,
    queryFn: () => signVideo(path),
  });

// ---------- auth context ----------
export const AuthContext = createContext<{ session: Session | null; ready: boolean }>({
  session: null,
  ready: false,
});
export function useAuth() {
  const { session, ready } = useContext(AuthContext);
  return { session, user: session?.user ?? null, uid: session?.user?.id, ready };
}
export function useMe() {
  const { uid } = useAuth();
  return useQuery({ ...profileQuery(uid ?? "none"), enabled: !!uid });
}
export function useUserData(): UserData {
  const { uid } = useAuth();
  const q = useQuery(userDataQuery(uid));
  return uid && q.data ? q.data : EMPTY_USER;
}

/** Returns a function that runs an action only when signed in; otherwise prompts sign-in. */
export function useRequireAuth() {
  const { uid } = useAuth();
  return (what: string, fn: (uid: string) => unknown) => {
    if (!uid) {
      toast(`Sign in to ${what}`, {
        action: { label: "Sign in", onClick: () => (window.location.href = "/auth") },
      });
      return;
    }
    return fn(uid);
  };
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[][]) =>
    Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
}

// ---------- mutations ----------
const recordedViews = new Set<string>();

export const actions = {
  async react(uid: string, videoId: string, value: 1 | -1, current: 1 | -1 | 0) {
    if (current === value)
      await supabase.from("video_reactions").delete().eq("user_id", uid).eq("video_id", videoId);
    else await supabase.from("video_reactions").upsert({ user_id: uid, video_id: videoId, value });
  },
  async toggleSub(uid: string, channelId: string, on: boolean) {
    if (on)
      await supabase
        .from("subscriptions")
        .delete()
        .eq("subscriber_id", uid)
        .eq("channel_id", channelId);
    else await supabase.from("subscriptions").insert({ subscriber_id: uid, channel_id: channelId });
  },
  async toggleWatchLater(uid: string, videoId: string, on: boolean) {
    if (on) await supabase.from("watch_later").delete().eq("user_id", uid).eq("video_id", videoId);
    else await supabase.from("watch_later").insert({ user_id: uid, video_id: videoId });
  },
  async recordWatch(uid: string | undefined, videoId: string) {
    // One view per video per browser session: a single mount must not be able
    // to inflate the counter (StrictMode, re-renders, repeated navigation).
    // The database remains the authoritative guard; this is a cheap first line.
    if (!/^[0-9a-f-]{1,64}$/i.test(videoId)) return;
    const key = `${uid ?? "anon"}:${videoId}`;
    if (recordedViews.has(key)) return;
    recordedViews.add(key);
    if (recordedViews.size > 500) recordedViews.clear();
    try {
      await supabase.rpc("record_view", { _video_id: videoId });
    } catch {
      recordedViews.delete(key);
      throw new Error("Could not record the view");
    }
    if (uid)
      await supabase
        .from("watch_history")
        .upsert({ user_id: uid, video_id: videoId, watched_at: new Date().toISOString() });
  },
};

export function initial(name: string) {
  return (name.trim()[0] ?? "?").toUpperCase();
}

export function recommend(vids: Video[], u: UserData, exclude?: string): Video[] {
  const list = vids.filter((v) => !v.isShort && v.id !== exclude);
  const watched = new Set(u.history.map((h) => h.id));
  const catScore: Record<string, number> = {};
  for (const h of u.history.slice(0, 30)) {
    const v = list.find((x) => x.id === h.id);
    if (v) catScore[v.category] = (catScore[v.category] ?? 0) + 1;
  }
  const ageDays = (v: Video) => (Date.now() - +new Date(v.publishedAt)) / 86400000;
  const score = (v: Video) =>
    Math.log10(v.views + 10) +
    (catScore[v.category] ?? 0) * 0.8 +
    (u.subscriptions.includes(v.channelId) ? 1.5 : 0) -
    (watched.has(v.id) ? 2 : 0) -
    Math.min(ageDays(v), 60) / 30;
  return [...list].sort((a, b) => score(b) - score(a));
}

// ---------- uploads ----------
export async function dataUrlToBlob(d: string) {
  // Only in-memory data URLs are allowed here — never fetch an arbitrary URL
  // supplied by a caller (SSRF / credential leak vector).
  if (!/^data:[a-z0-9/+.-]+;base64,/i.test(d)) throw new Error("Invalid image data");
  return (await fetch(d)).blob();
}
const UPLOAD_LIMITS: Record<"videos" | "thumbnails" | "channel-art", number> = {
  videos: 2 * 1024 * 1024 * 1024,
  thumbnails: 12 * 1024 * 1024,
  "channel-art": 12 * 1024 * 1024,
};
const ALLOWED_EXTS: Record<"videos" | "thumbnails" | "channel-art", RegExp> = {
  videos: /^(mp4|webm|mov|m4v)$/,
  thumbnails: /^(jpg|jpeg|png|webp)$/,
  "channel-art": /^(jpg|jpeg|png|webp)$/,
};

export async function uploadFile(
  bucket: "videos" | "thumbnails" | "channel-art",
  uid: string,
  file: Blob,
  ext: string,
) {
  const cleanExt = ext.toLowerCase();
  if (!ALLOWED_EXTS[bucket].test(cleanExt)) throw new Error("Unsupported file type");
  if (!file.size) throw new Error("Cannot upload an empty file");
  if (file.size > UPLOAD_LIMITS[bucket]) {
    throw new Error(
      `File exceeds the ${Math.round(UPLOAD_LIMITS[bucket] / 1048576)} MB upload limit`,
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(uid)) throw new Error("Invalid owner id");
  const path = `${uid}/${crypto.randomUUID()}.${cleanExt}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return path;
}
