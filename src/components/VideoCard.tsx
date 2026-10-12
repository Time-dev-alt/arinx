import { Link } from "@tanstack/react-router";
import { Clock, Check } from "lucide-react";
import type { Video } from "@/lib/data";
import { ago, duration, views } from "@/lib/format";
import { getChannel, setState, toggleIn, useAppState } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function Thumb({ v, className }: { v: Video; className?: string }) {
  const s = useAppState();
  const inWL = s.watchLater.includes(v.id);
  return (
    <div className={cn("group relative aspect-video overflow-hidden rounded-xl bg-muted", className)}>
      <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      <span className="absolute bottom-1.5 right-1.5 rounded bg-overlay/80 px-1 text-xs font-semibold text-overlay-foreground">{duration(v.duration)}</span>
      <button
        aria-label="Watch later"
        onClick={(e) => {
          e.preventDefault();
          setState((st) => ({ watchLater: toggleIn(st.watchLater, v.id) }));
          toast(inWL ? "Removed from Watch later" : "Saved to Watch later");
        }}
        className="absolute right-1.5 top-1.5 rounded bg-overlay/80 p-1 text-overlay-foreground opacity-0 transition group-hover:opacity-100"
      >
        {inWL ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function VideoCard({ v }: { v: Video }) {
  const s = useAppState();
  const c = getChannel(s, v.channelId);
  return (
    <Link to="/watch/$id" params={{ id: v.id }} className="block">
      <Thumb v={v} />
      <div className="mt-3 flex gap-3">
        {c && <img src={c.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />}
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-semibold leading-snug">{v.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{c?.name}</p>
          <p className="text-sm text-muted-foreground">
            {views(v.views)} · {ago(v.publishedAt)}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function VideoRow({ v, compact, extra }: { v: Video; compact?: boolean; extra?: React.ReactNode }) {
  const s = useAppState();
  const c = getChannel(s, v.channelId);
  return (
    <div className="flex gap-3">
      <Link to="/watch/$id" params={{ id: v.id }} className={cn("shrink-0", compact ? "w-40" : "w-full max-w-[360px] sm:w-[45%]")}>
        <Thumb v={v} className={compact ? "rounded-lg" : undefined} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to="/watch/$id" params={{ id: v.id }}>
          <h3 className={cn("line-clamp-2 font-semibold leading-snug", compact ? "text-sm" : "text-lg")}>{v.title}</h3>
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {views(v.views)} · {ago(v.publishedAt)}
        </p>
        {c && (
          <Link to="/channel/$handle" params={{ handle: c.handle }} className="mt-1 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            {!compact && <img src={c.avatar} alt="" className="h-6 w-6 rounded-full" />}
            {c.name}
          </Link>
        )}
        {!compact && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{v.description.split("\n\n")[1]}</p>}
        {extra}
      </div>
    </div>
  );
}

export function ShortCard({ v }: { v: Video }) {
  return (
    <Link to="/shorts" search={{ v: v.id }} className="block w-44 shrink-0 sm:w-48">
      <div className="aspect-[9/16] overflow-hidden rounded-xl bg-muted">
        <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-105" />
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold">{v.title}</h3>
      <p className="text-xs text-muted-foreground">{views(v.views)}</p>
    </Link>
  );
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="py-24 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
