import { createServerFn } from "@tanstack/react-start";
import { signPublicMediaMap, type MediaBucket } from "@/lib/media-signing.server";

type SignRequest = { bucket: MediaBucket; paths: string[] };

export const signPublicMedia = createServerFn({ method: "POST" })
  .validator((raw: unknown): SignRequest => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid media request");
    const input = raw as { bucket?: unknown; paths?: unknown };
    if (
      input.bucket !== "videos" &&
      input.bucket !== "thumbnails" &&
      input.bucket !== "channel-art"
    ) {
      throw new Error("Invalid media request");
    }
    if (
      !Array.isArray(input.paths) ||
      input.paths.length > 200 ||
      input.paths.some((path) => typeof path !== "string" || path.length > 220)
    ) {
      throw new Error("Invalid media request");
    }
    return { bucket: input.bucket, paths: input.paths as string[] };
  })
  .handler(async ({ data }) => signPublicMediaMap(data.bucket, data.paths));