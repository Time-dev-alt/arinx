import { useEffect, useRef, useState } from "react";
import { ExternalLink, Volume2, VolumeX } from "lucide-react";
import { useSiteSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type VastAd = {
  mediaUrl: string;
  clickUrl: string | null;
  skipSeconds: number;
  trackImpression: () => void;
  trackClick: () => void;
};

/** Parses "HH:MM:SS(.mmm)", "SS%", or plain seconds into a number of seconds. */
export function parseSkipOffset(offset: string | null | undefined, duration: number): number {
  if (!offset) return 5;
  if (offset.endsWith("%")) {
    const pct = Number(offset.slice(0, -1));
    return Number.isFinite(pct) && duration > 0 ? (pct / 100) * duration : 5;
  }
  const parts = offset.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 5;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

/** Fetches a VAST tag and extracts the first playable linear creative. */
async function loadVastAd(tagUrl: string): Promise<VastAd | null> {
  const { VASTClient, VASTTracker } = await import("@dailymotion/vast-client");
  const client = new VASTClient();
  const response = await client.get(tagUrl, { withCredentials: false, resolveAll: true });
  for (const ad of response.ads ?? []) {
    for (const creative of ad.creatives ?? []) {
      if (creative.type !== "linear") continue;
      type MediaFile = { fileURL?: string; deliveryType?: string; mimeType?: string; bitrate?: number };
      const media = ((creative.mediaFiles ?? []) as MediaFile[])
        .filter((m) => m.fileURL && (m.deliveryType === "progressive" || !m.deliveryType))
        .sort((a, b) => {
          const mp4 = (m: MediaFile) => (m.mimeType === "video/mp4" ? 0 : 1);
          return mp4(a) - mp4(b) || (a.bitrate ?? 0) - (b.bitrate ?? 0);
        })[0];
      if (!media?.fileURL) continue;
      const tracker = new VASTTracker(client, ad, creative);
      return {
        mediaUrl: media.fileURL,
        clickUrl: creative.videoClickThroughURLTemplate?.url ?? null,
        skipSeconds: parseSkipOffset(creative.skipOffset, creative.duration ?? 0),
        trackImpression: () => tracker.trackImpression(),
        trackClick: () => tracker.click(),
      };
    }
  }
  return null;
}

/**
 * Skippable pre-roll video ad shown before the main video.
 * Supports a direct sponsor video URL or any VAST ad-network tag,
 * configured in the owner admin panel (Monetization tab).
 */
export function PrerollAd({ onDone, className, guaranteed = 0, label = "Ad" }: { onDone: () => void; className?: string; guaranteed?: number; label?: string }) {
  const { data: s } = useSiteSettings();
  const vid = useRef<HTMLVideoElement>(null);
  const [left, setLeft] = useState(0);
  const [muted, setMuted] = useState(true);
  const [vast, setVast] = useState<VastAd | null>(null);
  const [vastFailed, setVastFailed] = useState(false);
  const impressionTracked = useRef(false);

  const useVast = !!(s?.ads_enabled && s.preroll_enabled && s.preroll_vast_url);
  const useDirect = !!(s?.ads_enabled && s.preroll_enabled && s.preroll_video_url);
  const active = useVast || useDirect;

  useEffect(() => {
    if (!useVast || !s?.preroll_vast_url) return;
    let cancelled = false;
    loadVastAd(s.preroll_vast_url)
      .then((ad) => { if (!cancelled) setVast(ad); if (!cancelled && !ad) setVastFailed(true); })
      .catch(() => { if (!cancelled) setVastFailed(true); });
    return () => { cancelled = true; };
  }, [useVast, s?.preroll_vast_url]);

  useEffect(() => {
    if (!active) onDone();
  }, [active, onDone]);

  if (!active || !s) return null;

  // VAST takes priority; fall back to the direct sponsor video when the tag fails or is empty.
  const src = useVast ? (vast?.mediaUrl ?? (vastFailed ? s.preroll_video_url : null)) : s.preroll_video_url;
  const clickUrl = useVast && vast ? vast.clickUrl ?? s.preroll_click_url : s.preroll_click_url;
  const skipAt = Math.max(0, guaranteed, useVast && vast ? vast.skipSeconds : s.preroll_skip_seconds);

  if (!src) {
    // VAST tag still loading — show a quiet placeholder instead of the player.
    return (
      <div className={cn("relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-overlay", className)}>
        <span className="text-xs text-overlay-foreground/60">Loading ad…</span>
      </div>
    );
  }

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-xl bg-overlay", className)}>
      <video
        ref={vid}
        src={src}
        autoPlay
        playsInline
        muted={muted}
        className="h-full w-full"
        onPlay={() => {
          if (!impressionTracked.current) {
            impressionTracked.current = true;
            vast?.trackImpression();
          }
        }}
        onTimeUpdate={(e) => setLeft(e.currentTarget.currentTime)}
        onEnded={onDone}
        onError={onDone}
      />
      <span className="absolute left-3 top-3 rounded bg-overlay/80 px-2 py-0.5 text-xs font-medium text-overlay-foreground">{label}</span>
      <button
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute ad" : "Mute ad"}
        className="absolute right-3 top-3 rounded-full bg-overlay/80 p-2 text-overlay-foreground hover:bg-overlay"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      {clickUrl && (
        <a
          href={clickUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => vast?.trackClick()}
          className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-overlay/80 px-3 py-1.5 text-xs font-medium text-overlay-foreground hover:bg-overlay"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Visit advertiser
        </a>
      )}
      <button
        onClick={onDone}
        disabled={left < skipAt}
        className="absolute bottom-3 right-3 rounded-full bg-overlay/80 px-4 py-1.5 text-sm font-medium text-overlay-foreground hover:bg-overlay disabled:cursor-not-allowed disabled:opacity-60"
      >
        {left < skipAt ? `Skip in ${Math.ceil(skipAt - left)}` : "Skip ad"}
      </button>
    </div>
  );
}
