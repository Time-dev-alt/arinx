import { createServerFn } from "@tanstack/react-start";
import type { PublicContent } from "@/lib/catalog";
import { DEMO_MODE, demoChannelMeta, demoVideoMeta } from "@/lib/demo-data";
import { publicDbClient } from "@/lib/public-db";
import { cleanMetaText } from "@/lib/seo";
import { thumbnailProxyUrl } from "@/lib/site";

const VIDEO_ID = /^[0-9a-f-]{36}$/i;

type Input = { kind: "video" | "channel"; id: string };

/** Crawl-safe public metadata for a watch page or channel page. */
export const publicContent = createServerFn({ method: "GET" })
  .validator((raw: unknown): Input => {
    const input = (raw ?? {}) as Partial<Input>;
    const kind = input.kind === "channel" ? "channel" : "video";
    const id = typeof input.id === "string" ? input.id.trim().slice(0, 200) : "";
    if (!id) throw new Error("Invalid content");
    return { kind, id };
  })
  .handler(async ({ data }): Promise<PublicContent | null> => {
    if (DEMO_MODE) {
      return data.kind === "channel" ? demoChannelMeta(data.id) : demoVideoMeta(data.id);
    }
    const client = publicDbClient();
    if (!client) return null;

    try {
      if (data.kind === "channel") {
        const { data: profile, error } = await client
          .from("profiles")
          .select("id,name,handle,bio,created_at,subscriber_count,avatar_url")
          .eq("handle", data.id)
          .maybeSingle();
        if (error || !profile) return null;
        type ChannelVideoRow = {
          id: string;
          title: string;
          description: string | null;
          created_at: string | null;
          duration: number | null;
          views: number | null;
          category: string | null;
          tags: string[] | null;
          is_short: boolean | null;
        };
        const { data: videos } = await client
          .from("videos")
          .select("id,title,description,created_at,duration,views,category,tags,is_short")
          .eq("owner_id", profile.id)
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(24);
        const avatarPath = profile.avatar_url as string | null;
        const { data: signedAvatar } =
          avatarPath && !/^(https?:|data:)/i.test(avatarPath)
            ? await client.storage.from("channel-art").createSignedUrl(avatarPath, 60 * 60 * 24)
            : { data: null };
        const channelName = cleanMetaText(profile.name, 120) || "ArinX creator";
        return {
          kind: "channel",
          id: profile.id,
          handle: profile.handle,
          title: channelName,
          description:
            cleanMetaText(profile.bio, 300) || `Watch videos from @${profile.handle} on ArinX.`,
          uploaded: profile.created_at ?? null,
          duration: 0,
          subscribers: Number(profile.subscriber_count ?? 0),
          joined: profile.created_at ?? null,
          avatar:
            avatarPath && /^(https?:|data:)/i.test(avatarPath)
              ? avatarPath
              : (signedAvatar?.signedUrl ?? null),
          recentVideos: ((videos ?? []) as unknown as ChannelVideoRow[]).map((v) => ({
            kind: "video" as const,
            id: v.id,
            title: cleanMetaText(v.title, 120),
            description:
              cleanMetaText(v.description, 300) || `Watch ${cleanMetaText(v.title, 120)} on ArinX.`,
            uploaded: v.created_at ?? null,
            duration: Number(v.duration ?? 0),
            views: Number(v.views ?? 0),
            category: v.category ?? "Other",
            tags: Array.isArray(v.tags) ? v.tags.slice(0, 20).map(String) : [],
            handle: profile.handle,
            channelName,
            thumbnail: thumbnailProxyUrl(v.id),
            isShort: !!v.is_short,
          })),
        };
      }

      if (!VIDEO_ID.test(data.id)) return null;
      const { data: row, error } = await client
        .from("videos")
        .select(
          "title,description,created_at,duration,views,category,tags,is_short,profiles!videos_owner_id_fkey(handle,name)",
        )
        .eq("id", data.id)
        .eq("visibility", "public")
        .maybeSingle();
      if (error || !row) return null;
      const profile = (row as { profiles?: { handle?: string; name?: string } | null }).profiles;
      return {
        kind: "video",
        id: data.id,
        title: cleanMetaText(row.title, 120),
        description: cleanMetaText(row.description, 300) || `Watch ${row.title} on ArinX.`,
        uploaded: row.created_at ?? null,
        duration: Number(row.duration ?? 0),
        views: Number(row.views ?? 0),
        category: row.category ?? "Other",
        tags: Array.isArray(row.tags) ? row.tags.slice(0, 20).map(String) : [],
        handle: profile?.handle ?? "",
        channelName: cleanMetaText(profile?.name, 120) || "ArinX creator",
        thumbnail: thumbnailProxyUrl(data.id),
        isShort: !!(row as { is_short?: boolean | null }).is_short,
      };
    } catch {
      // A transient DB failure must never turn a crawl into a 500 page.
      return null;
    }
  });
