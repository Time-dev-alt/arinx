import { useEffect, useRef, useState } from "react";
import { ExternalLink, Volume2, VolumeX } from "lucide-react";
import { useSiteSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { safeExternalUrl, safeHttpsUrl } from "@/lib/watch-tools";

type VastAd = {
  mediaUrl: string;
  clickUrl: string | null;
  skipSeconds: number;
  trackImpression: () => void;
  trackClick: () => void;
};

const VAST_TIMEOUT_MS = 8_000;

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

/** Fetches an HTTPS VAST tag and extracts the first playable, safe linear creative. */
async function loadVastAd(tagUrl: string): Promise<VastAd | null> {
  const safeTag = safeHttpsUrl(tagUrl);
  if (!safeTag) return null;
  const { VASTClient, VASTTracker } = await import("@dailymotion/vast-client");
  const client = new VASTClient();
  const response = await Promise.race([
    client.get(safeTag, { withCredentials: false, resolveAll: true }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("VAST tag timed out")), VAST_TIMEOUT_MS),
    ),
  ]);
  for (const ad of response.ads ?? []) {
    for (const creative of ad.creatives ?? []) {
      if (creative.type !== "linear") continue;
      type MediaFile = {
        fileURL?: string;
        deliveryType?: string;
        mimeType?: string;
        bitrate?: number;
      };
      const media = ((creative.mediaFiles ?? []) as MediaFile[])
        .filter((m) => m.fileURL && (m.deliveryType === "progressive" || !m.deliveryType))
        .sort((a, b) => {
          const mp4 = (m: MediaFile) => (m.mimeType === "video/mp4" ? 0 : 1);
          return mp4(a) - mp4(b) || (a.bitrate ?? 0) - (b.bitrate ?? 0);
        })[0];
      // Ad-network responses are untrusted: only http(s) media and links pass.
      const mediaUrl = safeExternalUrl(media?.fileURL);
      if (!mediaUrl) continue;
      const tracker = new VASTTracker(client, ad, creative);
      return {
        mediaUrl,
        clickUrl: safeExternalUrl(creative.videoClickThroughURLTemplate?.url),
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
export function PrerollAd({
  onDone,
  className,
  guaranteed = 0,
  label = "Ad",
}: {
  onDone: () => void;
  className?: string;
  guaranteed?: number;
  label?: string;
}) {
  const { data: s, isPending: settingsPending } = useSiteSettings();
  const vid = useRef<HTMLVideoElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [left, setLeft] = useState(0);
  const [muted, setMuted] = useState(true);
  const [vast, setVast] = useState<VastAd | null>(null);
  const [vastFailed, setVastFailed] = useState(false);
  const impressionTracked = useRef(false);

  const vastTag = safeHttpsUrl(s?.preroll_vast_url);
  const directSrc = safeExternalUrl(s?.preroll_video_url);
  const clickSetting = safeExternalUrl(s?.preroll_click_url);
  const useVast = !!(s?.ads_enabled && s.preroll_enabled && vastTag);
  const useDirect = !!(s?.ads_enabled && s.preroll_enabled && directSrc);
  const active = useVast || useDirect;

  useEffect(() => {
    if (!useVast || !vastTag) return;
    let cancelled = false;
    loadVastAd(vastTag)
      .then((ad) => {
        if (cancelled) return;
        setVast(ad);
        if (!ad) setVastFailed(true);
      })
      .catch(() => {
        if (!cancelled) setVastFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [useVast, vastTag]);

  // Wait until the settings query has settled before deciding there is no ad.
  // Previously `active` was false on the very first render (settings not yet
  // loaded), which skipped ads permanently even when they were enabled.
  useEffect(() => {
    if (!settingsPending && !active) onDoneRef.current();
  }, [settingsPending, active, s]);

  const noPlayableAd = !!(active && useVast && vastFailed && !vast && !directSrc);
  useEffect(() => {
    if (noPlayableAd) onDoneRef.current();
  }, [noPlayableAd]);

  if (!active || !s) return null;

  // VAST takes priority; fall back to the direct sponsor video when the tag fails or is empty.
  const src = useVast ? (vast?.mediaUrl ?? (vastFailed ? directSrc : null)) : directSrc;
  const clickUrl = useVast && vast ? (vast.clickUrl ?? clickSetting) : clickSetting;
  const skipAt = Math.min(
    60,
    Math.max(0, guaranteed, useVast && vast ? vast.skipSeconds : s.preroll_skip_seconds),
  );

  if (!src) {
    if (vastFailed) {
      // No playable creative and no fallback: never trap the viewer on an ad.
      return null;
    }
    return (
      <div
        className={cn(
          "relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-overlay",
          className,
        )}
      >
        <span className="text-xs text-overlay-foreground/60">Loading ad…</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-xl bg-overlay",
        className,
      )}
    >
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
        onEnded={() => onDoneRef.current()}
        onError={() => onDoneRef.current()}
      />
      <span className="absolute left-3 top-3 rounded bg-overlay/80 px-2 py-0.5 text-xs font-medium text-overlay-foreground">
        {label}
      </span>
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
        onClick={() => onDoneRef.current()}
        disabled={left < skipAt}
        className="absolute bottom-3 right-3 rounded-full bg-overlay/80 px-4 py-1.5 text-sm font-medium text-overlay-foreground hover:bg-overlay disabled:cursor-not-allowed disabled:opacity-60"
      >
        {left < skipAt ? `Skip in ${Math.ceil(skipAt - left)}` : "Skip ad"}
      </button>
    </div>
  );
}
