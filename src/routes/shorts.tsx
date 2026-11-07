import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  MessageSquare,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { Comments } from "@/components/Comments";
import { Avatar, SubscribeButton } from "@/components/common";
import { Empty } from "@/components/VideoCard";
import { compact, pageHead } from "@/lib/format";
import {
  actions,
  publicVideosQuery,
  useAuth,
  useRequireAuth,
  useUserData,
  videoSrcQuery,
  type Video,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { publicCatalog } from "@/lib/catalog.functions";
import { VideoLinks } from "@/components/SeoLinks";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";
import { canonicalUrl } from "@/lib/site";

export const Route = createFileRoute("/shorts")({
  validateSearch: (s: Record<string, unknown>): { v?: string } => ({
    v: typeof s.v === "string" ? s.v.slice(0, 200) : undefined,
  }),
  staleTime: 60_000,
  loader: () => publicCatalog({ data: { limit: 60 } }),
  head: ({ loaderData }) =>
    pageHead(
      "Shorts — short vertical videos on ArinX",
      "Watch and swipe through short vertical videos on ArinX: quick recipes, gaming clips, music, travel and comedy in under a minute.",
      {
        path: "/shorts",
        jsonLd: [
          itemListJsonLd(
            (loaderData?.videos ?? [])
              .filter((v: Video) => v.isShort)
              .map((v) => ({ id: v.id, title: v.title })),
            "Shorts on ArinX",
            canonicalUrl("/shorts"),
          ),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Shorts", path: "/shorts" },
          ]),
        ],
      },
    ),
  component: Shorts,
});

function Action({
  icon,
  label,
  onClick,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 text-xs font-medium">
      <span
        className={cn(
          "grid h-12 w-12 place-items-center rounded-full bg-muted hover:bg-accent",
          active && "bg-foreground text-background hover:bg-foreground",
        )}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function Short({
  v,
  muted,
  setMuted,
  onComments,
}: {
  v: Video;
  muted: boolean;
  setMuted: (m: boolean) => void;
  onComments: () => void;
}) {
  const u = useUserData();
  const { uid } = useAuth();
  const qc = useQueryClient();
  const req = useRequireAuth();
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const { data: url } = useQuery({ ...videoSrcQuery(v.videoPath), enabled: visible });
  const c = v.channel;
  const liked = u.liked.includes(v.id);
  const disliked = u.disliked.includes(v.id);
  const uidRef = useRef(uid);
  uidRef.current = uid;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setVisible((x) => x || e.isIntersecting);
        const vid = ref.current;
        if (e.isIntersecting) {
          if (vid) {
            vid.currentTime = 0;
            vid.play().catch(() => setPaused(true));
          }
          void actions.recordWatch(uidRef.current, v.id);
        } else vid?.pause();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [v.id]);

  const react = (val: 1 | -1) =>
    req("rate videos", async (me) => {
      await actions.react(me, v.id, val, liked ? 1 : disliked ? -1 : 0);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["videos"] }),
      ]);
    });

  return (
    <div
      ref={box}
      className="flex h-[calc(100vh-3.5rem)] snap-start snap-always items-center justify-center gap-4 py-4"
    >
      <div className="relative aspect-[9/16] h-full max-h-[820px] overflow-hidden rounded-2xl bg-overlay">
        <video
          ref={ref}
          src={url || undefined}
          poster={v.thumbnail ?? undefined}
          loop
          autoPlay={visible}
          muted={muted}
          playsInline
          className="h-full w-full object-cover"
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            if (el.paused) void el.play();
            else el.pause();
          }}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onTimeUpdate={(e) =>
            setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))
          }
        />
        {paused && (
          <Play className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 fill-current text-overlay-foreground/80" />
        )}
        <button
          onClick={() => setMuted(!muted)}
          aria-label={muted ? "Unmute" : "Mute"}
          className="absolute right-3 top-3 rounded-full bg-overlay/60 p-2 text-overlay-foreground"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-overlay/90 to-transparent p-4 pt-16 text-overlay-foreground">
          <div className="flex items-center gap-2">
            <Link
              to="/channel/$handle"
              params={{ handle: c.handle }}
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <Avatar ch={c} className="h-8 w-8 text-xs" /> @{c.handle}
            </Link>
            <SubscribeButton channelId={c.id} />
          </div>
          <p className="mt-2 text-sm">{v.title}</p>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-overlay-foreground/20">
          <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Action
          active={liked}
          icon={<ThumbsUp className="h-5 w-5" />}
          label={compact(v.likes)}
          onClick={() => react(1)}
        />
        <Action
          active={disliked}
          icon={<ThumbsDown className="h-5 w-5" />}
          label="Dislike"
          onClick={() => react(-1)}
        />
        <Action
          icon={<MessageSquare className="h-5 w-5" />}
          label="Comments"
          onClick={onComments}
        />
        <Action
          icon={<Share2 className="h-5 w-5" />}
          label="Share"
          onClick={() => {
            navigator.clipboard?.writeText(`${location.origin}/shorts?v=${v.id}`);
            toast("Link copied");
          }}
        />
      </div>
    </div>
  );
}

function Shorts() {
  const { v: start } = Route.useSearch();
  const catalog = Route.useLoaderData();
  const { data: allVids, isLoading } = useQuery({
    ...publicVideosQuery(),
    initialData: catalog?.videos,
  });
  const [muted, setMuted] = useState(true);
  const [comments, setComments] = useState<string | null>(null);
  if (isLoading || !allVids)
    return (
      <div className="grid h-[calc(100vh-3.5rem)] place-items-center">
        <div className="aspect-[9/16] h-[80%] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  const all = allVids.filter((v) => v.isShort);
  if (!all.length)
    return (
      <Empty
        title="No Shorts yet"
        text="Upload a vertical video under 60 seconds to create the first Short."
      />
    );
  const i = Math.max(
    0,
    all.findIndex((x) => x.id === start),
  );
  const list = [...all.slice(i), ...all.slice(0, i)];

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">ArinX Shorts — short vertical videos</h1>
      <div className="flex">
        <div className="no-scrollbar h-[calc(100vh-3.5rem)] flex-1 snap-y snap-mandatory overflow-y-scroll">
          {list.map((v) => (
            <Short
              key={v.id}
              v={v}
              muted={muted}
              setMuted={setMuted}
              onComments={() => setComments(v.id)}
            />
          ))}
        </div>
        {comments && (
          <aside className="fixed inset-x-0 bottom-0 z-40 h-[70vh] overflow-y-auto rounded-t-2xl border border-border bg-background p-4 md:static md:h-[calc(100vh-3.5rem)] md:w-[420px] md:rounded-none">
            <div className="flex justify-end">
              <button
                onClick={() => setComments(null)}
                aria-label="Close comments"
                className="rounded-full p-2 hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Comments videoId={comments} />
          </aside>
        )}
      </div>
      <VideoLinks
        title="All Shorts on ArinX"
        videos={all.map((v) => ({ id: v.id, title: v.title }))}
        className="mx-4 mb-8"
      />
    </div>
  );
}
