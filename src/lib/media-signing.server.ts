import { isSafeMediaObjectPath } from "@/lib/media-path";

export type MediaBucket = "videos" | "thumbnails" | "channel-art";
const SIGN_TTL_SECONDS = 60 * 60;

/** Sign only objects referenced by public/unlisted content or public profiles. */
export async function signPublicMediaMap(
  bucket: MediaBucket,
  requestedPaths: string[],
): Promise<Record<string, string>> {
  const paths = [...new Set(requestedPaths)]
    .filter((path) => isSafeMediaObjectPath(path))
    .slice(0, 200);
  if (!paths.length) return {};

  // Service-role access is deliberately loaded only within this server-only
  // helper, after validating every requested object key.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const allowed = new Set<string>();
  if (bucket === "videos") {
    const { data, error } = await supabaseAdmin
      .from("videos")
      .select("owner_id,video_path")
      .in("video_path", paths)
      .in("visibility", ["public", "unlisted"]);
    if (error) return {};
    for (const row of data ?? []) {
      if (isSafeMediaObjectPath(row.video_path, row.owner_id)) allowed.add(row.video_path);
    }
  } else if (bucket === "thumbnails") {
    const { data, error } = await supabaseAdmin
      .from("videos")
      .select("owner_id,thumbnail_url")
      .in("thumbnail_url", paths)
      .in("visibility", ["public", "unlisted"]);
    if (error) return {};
    for (const row of data ?? []) {
      if (row.thumbnail_url && isSafeMediaObjectPath(row.thumbnail_url, row.owner_id)) {
        allowed.add(row.thumbnail_url);
      }
    }
  } else {
    const [avatars, banners] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,avatar_url").in("avatar_url", paths),
      supabaseAdmin.from("profiles").select("id,banner_url").in("banner_url", paths),
    ]);
    if (avatars.error || banners.error) return {};
    for (const row of avatars.data ?? []) {
      if (row.avatar_url && isSafeMediaObjectPath(row.avatar_url, row.id)) {
        allowed.add(row.avatar_url);
      }
    }
    for (const row of banners.data ?? []) {
      if (row.banner_url && isSafeMediaObjectPath(row.banner_url, row.id)) {
        allowed.add(row.banner_url);
      }
    }
  }

  const authorizedPaths = [...allowed];
  if (!authorizedPaths.length) return {};
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrls(
    authorizedPaths,
    SIGN_TTL_SECONDS,
  );
  if (error) return {};
  const result: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && allowed.has(item.path)) result[item.path] = item.signedUrl;
  }
  return result;
}