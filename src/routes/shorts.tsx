import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Share2, ThumbsDown, ThumbsUp, Volume2, VolumeX, X, Play } from "lucide-react";
import { toast } from "sonner";
import { Comments } from "@/components/Comments";
import { useResolvedSrc } from "@/components/Player";
import { SubscribeButton } from "@/routes/watch.$id";
import type { Video } from "@/lib/data";
import { compact, pageHead } from "@/lib/format";
import { getChannel, publicVideos, setState, toggleIn, useAppState } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shorts")({
  validateSearch: (s: Record<string, unknown>): { v?: string } => ({ v: typeof s.v === "string" ? s.v : undefined }),
  head: () => pageHead("Shorts", "Swipe through short vertical videos on ArinX."),
  component: Shorts,
});

function Short({ v, muted, setMuted, onComments }: { v: Video; muted: boolean; setMuted: (m: boolean) => void; onComments: () => void }) {
  const s = useAppState();
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const url = useResolvedSrc(v.src);
  const c = getChannel(s, v.channelId)!;
  const liked = s.liked.includes(v.id);
  const disliked = s.disliked.includes(v.id);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        const vid = ref.current;
        if (!vid) return;
        if (e.isIntersecting) {
          vid.currentTime = 0;
          vid.play().catch(() => setPaused(true));
          setState((st) => ({ history: [{ id: v.id, at: new Date().toISOString() }, ...st.history.filter((h) => h.id !== v.id)].slice(0, 200) }));
        } else vid.pause();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [v.id]);

  const Action = ({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) => (
    <button onClick={onClick} className="flex flex-col items-center gap-1 text-xs font-medium">
      <span className={cn("grid h-12 w-12 place-items-center rounded-full bg-muted hover:bg-accent", active && "bg-foreground text-background hover:bg-foreground")}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div ref={box} className="flex h-[calc(100vh-3.5rem)] snap-start snap-always items-center justify-center gap-4 py-4">
      <div className="relative aspect-[9/16] h-full max-h-[820px] overflow-hidden rounded-2xl bg-overlay">
        <video
          ref={ref}
          src={url || undefined}
          poster={v.thumbnail}
          loop
          muted={muted}
          playsInline
          className="h-full w-full object-cover"
          onClick={() => { const el = ref.current; if (!el) return; el.paused ? el.play() : el.pause(); }}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
        />
        {paused && <Play className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 fill-current text-overlay-foreground/80" />}
        <button onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"} className="absolute right-3 top-3 rounded-full bg-overlay/60 p-2 text-overlay-foreground">
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-overlay/90 to-transparent p-4 pt-16 text-overlay-foreground">
          <div className="flex items-center gap-2">
            <Link to="/channel/$handle" params={{ handle: c.handle }} className="flex items-center gap-2 text-sm font-semibold">
              <img src={c.avatar} alt="" className="h-8 w-8 rounded-full" /> @{c.handle}
            </Link>
            <SubscribeButton channelId={c.id} />
          </div>
          <p className="mt-2 text-sm">{v.title}</p>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-overlay-foreground/20"><div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} /></div>
      </div>
      <div className="flex flex-col gap-4">
        <Action active={liked} icon={<ThumbsUp className="h-5 w-5" />} label={compact(v.likes + (liked ? 1 : 0))} onClick={() => setState((st) => ({ liked: toggleIn(st.liked, v.id), disliked: st.disliked.filter((x) => x !== v.id) }))} />
        <Action active={disliked} icon={<ThumbsDown className="h-5 w-5" />} label="Dislike" onClick={() => setState((st) => ({ disliked: toggleIn(st.disliked, v.id), liked: st.liked.filter((x) => x !== v.id) }))} />
        <Action icon={<MessageSquare className="h-5 w-5" />} label="Comments" onClick={onComments} />
        <Action icon={<Share2 className="h-5 w-5" />} label="Share" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/shorts?v=${v.id}`); toast("Link copied"); }} />
      </div>
    </div>
  );
}

function Shorts() {
  const { v: start } = Route.useSearch();
  const s = useAppState();
  const [muted, setMuted] = useState(true);
  const [comments, setComments] = useState<string | null>(null);
  const all = publicVideos(s).filter((v) => v.isShort);
  const i = Math.max(0, all.findIndex((x) => x.id === start));
  const list = [...all.slice(i), ...all.slice(0, i)];

  return (
    <div className="flex">
      <div className="no-scrollbar h-[calc(100vh-3.5rem)] flex-1 snap-y snap-mandatory overflow-y-scroll">
        {list.map((v) => <Short key={v.id} v={v} muted={muted} setMuted={setMuted} onComments={() => setComments(v.id)} />)}
      </div>
      {comments && (
        <aside className="fixed inset-x-0 bottom-0 z-40 h-[70vh] overflow-y-auto rounded-t-2xl border border-border bg-background p-4 md:static md:h-[calc(100vh-3.5rem)] md:w-[420px] md:rounded-none">
          <div className="flex justify-end">
            <button onClick={() => setComments(null)} aria-label="Close comments" className="rounded-full p-2 hover:bg-accent"><X className="h-5 w-5" /></button>
          </div>
          <Comments videoId={comments} />
        </aside>
      )}
    </div>
  );
}
