import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { Video } from "@/lib/data";
import { ME_ID } from "@/lib/data";
import { setState, toggleIn, useAppState } from "@/lib/store";
import { cn } from "@/lib/utils";
import { VideoCard } from "./VideoCard";

export function Pills({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto">
      {items.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition", value === c ? "bg-foreground text-background" : "bg-muted hover:bg-accent")}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

export function Grid({ vids }: { vids: Video[] }) {
  return (
    <div className="mt-2 grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {vids.map((v) => <VideoCard key={v.id} v={v} />)}
    </div>
  );
}

export function SubscribeButton({ channelId }: { channelId: string }) {
  const s = useAppState();
  if (channelId === ME_ID)
    return <Link to="/studio" className="rounded-full bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">Manage videos</Link>;
  const on = s.subscriptions.includes(channelId);
  return (
    <button
      onClick={() => {
        setState((st) => ({ subscriptions: toggleIn(st.subscriptions, channelId) }));
        toast(on ? "Subscription removed" : "Subscribed!");
      }}
      className={cn("rounded-full px-4 py-2 text-sm font-medium transition", on ? "bg-muted text-foreground hover:bg-accent" : "bg-foreground text-background hover:opacity-90")}
    >
      {on ? "Subscribed" : "Subscribe"}
    </button>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-6 font-display text-3xl font-bold">{children}</h1>;
}
