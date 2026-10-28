import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useSiteSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * Skippable pre-roll video ad shown before the main video.
 * Configured in the owner admin panel (Monetization tab).
 */
export function PrerollAd({ onDone, className }: { onDone: () => void; className?: string }) {
  const { data: s } = useSiteSettings();
  const vid = useRef<HTMLVideoElement>(null);
  const [left, setLeft] = useState(0);
  const active = !!(s?.ads_enabled && s.preroll_enabled && s.preroll_video_url);

  useEffect(() => {
    if (!active) onDone();
  }, [active, onDone]);

  if (!active || !s) return null;
  const skipAt = Math.max(0, s.preroll_skip_seconds);

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-xl bg-overlay", className)}>
      <video
        ref={vid}
        src={s.preroll_video_url}
        autoPlay
        playsInline
        className="h-full w-full"
        onTimeUpdate={(e) => setLeft(e.currentTarget.currentTime)}
        onEnded={onDone}
        onError={onDone}
      />
      <span className="absolute left-3 top-3 rounded bg-overlay/80 px-2 py-0.5 text-xs font-medium text-overlay-foreground">Ad</span>
      {s.preroll_click_url && (
        <a
          href={s.preroll_click_url}
          target="_blank"
          rel="noopener noreferrer sponsored"
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
