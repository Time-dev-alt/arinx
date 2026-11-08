import type { MediaProbe } from "@/lib/media-plan";

/**
 * Fast, read-only metadata probe used to choose the shortest possible encode.
 * Runs in the browser via mediabunny and never decodes a frame. Failures are
 * non-fatal: the encoder falls back to conservative ffmpeg expressions.
 */
export async function probeMedia(file: Blob, timeoutMs = 8_000): Promise<MediaProbe | null> {
  if (typeof window === "undefined") return null;
  try {
    const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

    const work = (async (): Promise<MediaProbe | null> => {
      try {
        const [format, video, audio, duration] = await Promise.all([
          input.getFormat(),
          input.getPrimaryVideoTrack(),
          input.getPrimaryAudioTrack(),
          input.computeDuration().catch(() => 0),
        ]);
        if (!video) return null;
        const [videoCodec, audioCodec] = await Promise.all([
          video.getCodec().catch(() => null),
          audio ? audio.getCodec().catch(() => null) : Promise.resolve(null),
        ]);
        const rawName = format.name.toLowerCase();
        const container = /mp4|isobmff|quicktime|mov/.test(rawName) ? "mp4" : rawName;
        return {
          width: video.displayWidth || 0,
          height: video.displayHeight || 0,
          duration: Number.isFinite(duration) ? duration : 0,
          videoCodec: videoCodec ? String(videoCodec) : null,
          audioCodec: audioCodec ? String(audioCodec) : null,
          container,
        };
      } finally {
        input.dispose();
      }
    })();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
