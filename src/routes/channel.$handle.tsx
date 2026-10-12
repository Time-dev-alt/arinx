import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ThumbsUp, Pencil } from "lucide-react";
import { COMMUNITY, ME_ID } from "@/lib/data";
import { ago, compact, pageHead } from "@/lib/format";
import { allVideos, getChannels, useAppState } from "@/lib/store";
import { Empty, ShortCard, VideoCard } from "@/components/VideoCard";
import { SubscribeButton } from "@/components/common";
import { cn } from "@/lib/utils";

const TABS = ["Home", "Videos", "Shorts", "Playlists", "Community", "About"] as const;

export const Route = createFileRoute("/channel/$handle")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({ tab: typeof s.tab === "string" ? s.tab : undefined }),
  head: ({ params }) => pageHead(`@${params.handle}`, `Watch videos, Shorts and posts from @${params.handle} on ArinX.`),
  component: ChannelPage,
});

function ChannelPage() {
  const { handle } = Route.useParams();
  const { tab = "Home" } = Route.useSearch();
  const nav = useNavigate();
  const s = useAppState();
  const c = getChannels(s).find((x) => x.handle === handle);
  if (!c) return <Empty title="Channel not found" text="This channel doesn't exist." />;
  const mine = c.id === ME_ID;
  const vids = allVideos(s)
    .filter((v) => v.channelId === c.id && (v.visibility === "public" || mine))
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  const longs = vids.filter((v) => !v.isShort);
  const shorts = vids.filter((v) => v.isShort);
  const posts = COMMUNITY.filter((p) => p.channelId === c.id);
  const totalViews = vids.reduce((a, v) => a + v.views, 0);
  const popular = [...longs].sort((a, b) => b.views - a.views);

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-12 sm:px-6">
      <img src={c.banner} alt="" className="mt-2 aspect-[6/1] w-full rounded-2xl object-cover" />
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <img src={c.avatar} alt="" className="h-24 w-24 rounded-full object-cover sm:h-40 sm:w-40" />
        <div className="flex-1">
          <h1 className="font-display text-3xl font-bold">{c.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">@{c.handle}</span> · {compact(c.subscribers + (s.subscriptions.includes(c.id) ? 1 : 0))} subscribers · {longs.length + shorts.length} videos
          </p>
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{c.bio}</p>
          <div className="mt-3 flex gap-2">
            <SubscribeButton channelId={c.id} />
            {mine && (
              <Link to="/studio/customize" className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium hover:bg-accent"><Pencil className="h-4 w-4" /> Customize channel</Link>
            )}
          </div>
        </div>
      </div>
      <nav className="no-scrollbar mt-4 flex gap-6 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button key={t} onClick={() => nav({ to: "/channel/$handle", params: { handle }, search: { tab: t } })} className={cn("shrink-0 border-b-2 py-3 text-sm font-medium", tab === t ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "Home" && (
          <div className="space-y-10">
            {longs[0] && (
              <Link to="/watch/$id" params={{ id: longs[0].id }} className="flex flex-col gap-4 md:flex-row">
                <img src={longs[0].thumbnail} alt="" className="aspect-video w-full rounded-xl object-cover md:w-[420px]" />
                <div>
                  <h2 className="text-lg font-semibold">{longs[0].title}</h2>
                  <p className="text-sm text-muted-foreground">{compact(longs[0].views)} views · {ago(longs[0].publishedAt)}</p>
                  <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{longs[0].description}</p>
                </div>
              </Link>
            )}
            <Section title="Popular videos"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{popular.slice(0, 4).map((v) => <VideoCard key={v.id} v={v} />)}</div></Section>
            {shorts.length > 0 && <Section title="Shorts"><div className="no-scrollbar flex gap-4 overflow-x-auto">{shorts.map((v) => <ShortCard key={v.id} v={v} />)}</div></Section>}
          </div>
        )}
        {tab === "Videos" && (longs.length ? <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">{longs.map((v) => <VideoCard key={v.id} v={v} />)}</div> : <Empty title="No videos yet" text="This channel hasn't uploaded videos." />)}
        {tab === "Shorts" && (shorts.length ? <div className="flex flex-wrap gap-4">{shorts.map((v) => <ShortCard key={v.id} v={v} />)}</div> : <Empty title="No Shorts yet" text="Nothing here yet." />)}
        {tab === "Playlists" && (
          longs.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link to="/watch/$id" params={{ id: longs[0].id }} className="block">
                <div className="relative">
                  <img src={longs[0].thumbnail} alt="" className="aspect-video w-full rounded-xl object-cover" />
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-overlay/80 px-1.5 text-xs text-overlay-foreground">{longs.length} videos</span>
                </div>
                <p className="mt-2 font-semibold">All uploads</p>
                <p className="text-xs text-muted-foreground">View full playlist</p>
              </Link>
            </div>
          ) : <Empty title="No playlists" text="This channel has no public playlists." />
        )}
        {tab === "Community" && (
          <div className="max-w-2xl space-y-4">
            {posts.map((p) => (
              <article key={p.id} className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 text-sm"><img src={c.avatar} alt="" className="h-8 w-8 rounded-full" /><span className="font-semibold">{c.name}</span><span className="text-muted-foreground">{ago(p.createdAt)}</span></div>
                <p className="mt-3 text-sm">{p.text}</p>
                {p.image && <img src={p.image} alt="" className="mt-3 rounded-xl" />}
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><ThumbsUp className="h-4 w-4" /> {compact(p.likes)}</p>
              </article>
            ))}
          </div>
        )}
        {tab === "About" && (
          <div className="grid max-w-3xl gap-8 md:grid-cols-[2fr_1fr]">
            <div><h2 className="mb-2 font-semibold">Description</h2><p className="whitespace-pre-wrap text-sm">{c.bio}</p></div>
            <div className="space-y-3 text-sm">
              <h2 className="font-semibold">Stats</h2>
              <p className="border-b border-border pb-3">Joined {new Date(c.joined).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
              <p className="border-b border-border pb-3">{totalViews.toLocaleString()} views</p>
              <p>{c.location}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 font-display text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
