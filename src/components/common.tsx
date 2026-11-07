import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  actions,
  initial,
  useAuth,
  useRequireAuth,
  useUserData,
  type Channel,
  type Video,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { VideoCard } from "./VideoCard";

export function Avatar({
  ch,
  className,
}: {
  ch: Pick<Channel, "name" | "avatar"> | null | undefined;
  className?: string;
}) {
  if (ch?.avatar)
    return (
      <img
        src={ch.avatar}
        alt={ch.name ? `${ch.name} channel avatar` : ""}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground",
        className,
      )}
    >
      {initial(ch?.name ?? "?")}
    </span>
  );
}

export function Pills({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto">
      {items.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cn(
            "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition",
            value === c ? "bg-foreground text-background" : "bg-muted hover:bg-accent",
          )}
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
      {vids.map((v) => (
        <VideoCard key={v.id} v={v} />
      ))}
    </div>
  );
}

export function SubscribeButton({ channelId }: { channelId: string }) {
  const { uid } = useAuth();
  const u = useUserData();
  const qc = useQueryClient();
  const req = useRequireAuth();
  if (channelId === uid)
    return (
      <Link
        to="/studio"
        className="rounded-full bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
      >
        Manage videos
      </Link>
    );
  const on = u.subscriptions.includes(channelId);
  return (
    <button
      onClick={() =>
        req("subscribe", async (id) => {
          await actions.toggleSub(id, channelId, on);
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["me"] }),
            qc.invalidateQueries({ queryKey: ["channel"] }),
            qc.invalidateQueries({ queryKey: ["video"] }),
          ]);
          toast(on ? "Subscription removed" : "Subscribed!");
        })
      }
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition",
        on
          ? "bg-muted text-foreground hover:bg-accent"
          : "bg-foreground text-background hover:opacity-90",
      )}
    >
      {on ? "Subscribed" : "Subscribe"}
    </button>
  );
}

export function SignInPrompt({ title, text }: { title: string; text: string }) {
  return (
    <div className="py-24 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      <Link
        to="/auth"
        className="mt-6 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
      >
        Sign in
      </Link>
    </div>
  );
}

export function Loading() {
  return (
    <div className="grid gap-x-4 gap-y-10 p-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i}>
          <div className="aspect-video animate-pulse rounded-xl bg-muted" />
          <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
