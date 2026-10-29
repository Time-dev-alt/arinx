import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  PictureInPicture2,
  RectangleHorizontal,
  Settings,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { duration as fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export interface PlayerHandle {
  seek: (t: number) => void;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const Player = forwardRef<
  PlayerHandle,
  { src: string; poster?: string; theater?: boolean; onTheater?: () => void; onNext?: () => void; startTime?: number; onTimeChange?: (time: number) => void }
>(function Player({ src, poster, theater, onTheater, onNext, startTime = 0, onTimeChange }, ref) {
  const url = src;
  const wrap = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [menu, setMenu] = useState(false);
  const [fs, setFs] = useState(false);
  const [active, setActive] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [error, setError] = useState(false);
  const hideT = useRef<number>(0);

  useImperativeHandle(ref, () => ({
    seek: (t) => {
      if (vid.current) {
        vid.current.currentTime = t;
        void vid.current.play().catch(() => {});
      }
    },
  }));

  const toggle = () => {
    const v = vid.current;
    if (!v) return;
    v.paused ? void v.play().catch(() => {}) : v.pause();
  };
  const poke = () => {
    setActive(true);
    window.clearTimeout(hideT.current);
    hideT.current = window.setTimeout(() => setActive(false), 2500);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.current?.requestFullscreen();
  };
  const pip = async () => {
    const v = vid.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      /* unsupported */
    }
  };

  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") { setShortcuts(x => !x); return; }
      if (document.querySelector('[role="dialog"]')) return;
      const v = vid.current;
      if (!v) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") { e.preventDefault(); toggle(); }
      else if (k === "f") fullscreen();
      else if (k === "m") { v.muted = !v.muted; setMuted(v.muted); }
      else if (k === "t") onTheater?.();
      else if (k === "i") pip();
      else if (k === "arrowright" || k === "l") v.currentTime += k === "l" ? 10 : 5;
      else if (k === "arrowleft" || k === "j") v.currentTime -= k === "j" ? 10 : 5;
      else return;
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const seekFromEvent = (clientX: number) => {
    const b = bar.current, v = vid.current;
    if (!b || !v || !dur) return;
    const r = b.getBoundingClientRect();
    v.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * dur;
  };

  const showUI = active || !playing || menu;

  return (
    <div
      ref={wrap}
      onMouseMove={poke}
      onMouseLeave={() => playing && setActive(false)}
      className={cn("group relative w-full overflow-hidden bg-overlay", fs ? "h-full" : theater ? "aspect-video max-h-[75vh]" : "aspect-video rounded-xl", !showUI && "cursor-none")}
    >
      <video
        ref={vid}
        src={url || undefined}
        poster={poster}
        autoPlay
        playsInline
        className="h-full w-full"
        onClick={toggle}
        onDoubleClick={fullscreen}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => { setTime(e.currentTarget.currentTime); onTimeChange?.(e.currentTarget.currentTime); }}
        onLoadedMetadata={(e) => { setError(false); setDur(e.currentTarget.duration); e.currentTarget.playbackRate = speed; if (startTime > 0) e.currentTarget.currentTime = Math.min(startTime, Math.max(0, e.currentTarget.duration - 0.1)); }}
        onError={() => setError(true)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onVolumeChange={(e) => { setVol(e.currentTarget.volume); setMuted(e.currentTarget.muted); }}
        onEnded={() => onNext?.()}
      />
      <Dialog open={shortcuts} onOpenChange={setShortcuts}><DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm"><DialogTitle>Playback shortcuts</DialogTitle><DialogDescription>Keyboard controls</DialogDescription><dl className="grid grid-cols-2 gap-3 text-sm">{[["Space / K", "Play or pause"], ["J / L", "Back / forward 10s"], ["← / →", "Back / forward 5s"], ["M", "Mute"], ["F", "Full screen"], ["T", "Theater mode"], ["I", "Picture in picture"]].map(([key, label]) => <div key={key} className="contents"><dt className="font-mono text-primary">{key}</dt><dd>{label}</dd></div>)}</dl></DialogContent></Dialog>
      {error && <div className="absolute inset-0 grid place-content-center gap-3 bg-overlay text-center text-overlay-foreground"><p>Unable to play this video</p><Button variant="secondary" onClick={() => { setError(false); vid.current?.load(); }}>Retry</Button></div>}

      {!playing && !error && (
        <button onClick={toggle} aria-label="Play" className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-overlay/60 text-overlay-foreground">
          <Play className="h-8 w-8 fill-current" />
        </button>
      )}

      <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-overlay/90 to-transparent px-3 pb-2 pt-10 text-overlay-foreground transition-opacity", showUI ? "opacity-100" : "opacity-0")}>
        <div
          ref={bar}
          className="group/bar relative h-4 cursor-pointer"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromEvent(e.clientX);
          }}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
            if (e.buttons === 1) seekFromEvent(e.clientX);
          }}
          onPointerLeave={() => setHover(null)}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-overlay-foreground/25 transition-all group-hover/bar:h-1.5">
            <div className="absolute inset-y-0 left-0 rounded bg-overlay-foreground/40" style={{ width: `${dur ? (buffered / dur) * 100 : 0}%` }} />
            <div className="absolute inset-y-0 left-0 rounded bg-primary" style={{ width: `${dur ? (time / dur) * 100 : 0}%` }} />
          </div>
          <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-primary transition group-hover/bar:scale-100" style={{ left: `${dur ? (time / dur) * 100 : 0}%` }} />
          {hover !== null && dur > 0 && (
            <span className="absolute -top-7 -translate-x-1/2 rounded bg-overlay/90 px-1.5 py-0.5 text-xs" style={{ left: `${hover * 100}%` }}>
              {fmt(hover * dur)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="rounded p-1.5 hover:bg-overlay-foreground/10">
            {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
          </button>
          {onNext && (
            <button onClick={onNext} aria-label="Next" className="rounded p-1.5 hover:bg-overlay-foreground/10"><SkipForward className="h-5 w-5 fill-current" /></button>
          )}
          <div className="group/vol flex items-center">
            <button
              aria-label={muted ? "Unmute" : "Mute"}
              onClick={() => { const v = vid.current; if (v) v.muted = !v.muted; }}
              className="rounded p-1.5 hover:bg-overlay-foreground/10"
            >
              {muted || vol === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              aria-label="Volume"
              value={muted ? 0 : vol}
              onChange={(e) => { const v = vid.current; if (v) { v.volume = Number(e.target.value); v.muted = v.volume === 0; } }}
              className="w-0 accent-primary transition-all group-hover/vol:w-20"
            />
          </div>
          <span className="ml-2 tabular-nums">{fmt(time)} / {fmt(dur)}</span>
          <div className="flex-1" />
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} aria-label="Playback speed" className="flex items-center gap-1 rounded p-1.5 hover:bg-overlay-foreground/10">
              <Settings className="h-5 w-5" />
              {speed !== 1 && <span className="text-xs">{speed}x</span>}
            </button>
            {menu && (
              <div className="absolute bottom-10 right-0 w-36 rounded-lg bg-overlay/95 py-2 text-sm">
                <p className="px-3 pb-1 text-xs opacity-70">Playback speed</p>
                {SPEEDS.map((sp) => (
                  <button
                    key={sp}
                    onClick={() => { setSpeed(sp); if (vid.current) vid.current.playbackRate = sp; setMenu(false); }}
                    className={cn("block w-full px-3 py-1 text-left hover:bg-overlay-foreground/10", sp === speed && "text-primary")}
                  >
                    {sp === 1 ? "Normal" : `${sp}x`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={pip} aria-label="Picture in picture" className="rounded p-1.5 hover:bg-overlay-foreground/10"><PictureInPicture2 className="h-5 w-5" /></button>
          {onTheater && !fs && (
            <button onClick={onTheater} aria-label="Theater mode" className="hidden rounded p-1.5 hover:bg-overlay-foreground/10 lg:block"><RectangleHorizontal className="h-5 w-5" /></button>
          )}
          <button onClick={fullscreen} aria-label="Full screen" className="rounded p-1.5 hover:bg-overlay-foreground/10">
            {fs ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
});
