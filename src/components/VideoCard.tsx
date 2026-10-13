import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Check, Play } from "lucide-react";
import { toast } from "sonner";
import { actions, useRequireAuth, useUserData, type Video } from "@/lib/api";
import { ago, duration, views } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "./common";

export function Thumb({ v, className }: { v: Video; className?: string }) {
  const u = useUserData();
  const qc = useQueryClient();
  const req = useRequireAuth();
  const inWL = u.watchLater.includes(v.id);
  return (
    <div className={cn("group relative aspect-video overflow-hidden rounded-xl bg-muted", className)}>
      {v.thumbnail ? (
        <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      ) : (
        <div className="grid h-full w-full place-items-center text-muted-foreground"><Play className="h-8 w-8" /></div>
      )}
      <span className="absolute bottom-1.5 right-1.5 rounded bg-overlay/80 px-1 text-xs font-semibold text-overlay-foreground">{duration(v.duration)}</span>
      <button
        aria-label="Watch later"
        onClick={(e) => {
          e.preventDefault();
          req("save videos", async (uid) => {
            await actions.toggleWatchLater(uid, v.id, inWL);
            await qc.invalidateQueries({ queryKey: ["me"] });
            toast(inWL ? "Removed from Watch later" : "Saved to Watch later");
          });
        }}
        className="absolute right-1.5 top-1.5 rounded bg-overlay/80 p-1 text-overlay-foreground opacity-0 transition group-hover:opacity-100"
      >
        {inWL ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function VideoCard({ v }: { v: Video }) {
  return (
    <Link to="/watch/$id" params={{ id: v.id }} className="block">
      <Thumb v={v} />
      <div className="mt-3 flex gap-3">
        <Avatar ch={v.channel} className="h-9 w-9 text-sm" />
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-semibold leading-snug">{v.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{v.channel.name}</p>
          <p className="text-sm text-muted-foreground">{views(v.views)} · {ago(v.publishedAt)}</p>
        </div>
      </div>
    </Link>
  );
}

export function VideoRow({ v, compact, extra }: { v: Video; compact?: boolean; extra?: React.ReactNode }) {
  const c = v.channel;
  return (
    <div className="flex gap-3">
      <Link to="/watch/$id" params={{ id: v.id }} className={cn("shrink-0", compact ? "w-40" : "w-full max-w-[360px] sm:w-[45%]")}>
        <Thumb v={v} className={compact ? "rounded-lg" : undefined} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to="/watch/$id" params={{ id: v.id }}>
          <h3 className={cn("line-clamp-2 font-semibold leading-snug", compact ? "text-sm" : "text-lg")}>{v.title}</h3>
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">{views(v.views)} · {ago(v.publishedAt)}</p>
        <Link to="/channel/$handle" params={{ handle: c.handle }} className="mt-1 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          {!compact && <Avatar ch={c} className="h-6 w-6 text-[10px]" />}
          {c.name}
        </Link>
        {!compact && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{v.description}</p>}
        {extra}
      </div>
    </div>
  );
}

export function ShortCard({ v }: { v: Video }) {
  return (
    <Link to="/shorts" search={{ v: v.id }} className="block w-44 shrink-0 sm:w-48">
      <div className="aspect-[9/16] overflow-hidden rounded-xl bg-muted">
        {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-105" />}
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold">{v.title}</h3>
      <p className="text-xs text-muted-foreground">{views(v.views)}</p>
    </Link>
  );
}

export function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="py-24 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      {children}
    </div>
  );
}
