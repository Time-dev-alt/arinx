import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, History, ListVideo, ThumbsUp } from "lucide-react";
import { VideoCard } from "@/components/VideoCard";
import { pageHead } from "@/lib/format";
import { getChannel, getVideo, useAppState } from "@/lib/store";
import { ME_ID, type Video } from "@/lib/data";

export const Route = createFileRoute("/library")({
  head: () => pageHead("Library", "Your history, Watch later, liked videos and playlists on ArinX."),
  component: LibraryPage,
});

function Shelf({ icon, title, to, vids }: { icon: React.ReactNode; title: string; to: React.ReactNode; vids: Video[] }) {
  return (
    <section className="border-b border-border pb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-3 font-display text-xl font-semibold">{icon} {title} <span className="text-sm font-normal text-muted-foreground">{vids.length}</span></h2>
        {to}
      </div>
      {vids.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{vids.slice(0, 4).map((v) => <VideoCard key={v.id} v={v} />)}</div>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      )}
    </section>
  );
}

function LibraryPage() {
  const s = useAppState();
  const me = getChannel(s, ME_ID)!;
  const pick = (ids: string[]) => ids.map((id) => getVideo(s, id)).filter(Boolean) as Video[];
  const seeAll = (id: string) => <Link to="/playlist/$id" params={{ id }} className="rounded-full px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10">See all</Link>;
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 pb-12">
      <div className="flex items-center gap-4">
        <img src={me.avatar} alt="" className="h-20 w-20 rounded-full object-cover" />
        <div>
          <h1 className="font-display text-3xl font-bold">{me.name}</h1>
          <p className="text-sm text-muted-foreground">@{me.handle} · {s.subscriptions.length} subscriptions · {s.liked.length} likes</p>
        </div>
      </div>
      <Shelf icon={<History className="h-6 w-6" />} title="History" vids={pick(s.history.map((h) => h.id))} to={<Link to="/history" className="rounded-full px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10">See all</Link>} />
      <Shelf icon={<Clock className="h-6 w-6" />} title="Watch later" vids={pick(s.watchLater)} to={seeAll("WL")} />
      <Shelf icon={<ThumbsUp className="h-6 w-6" />} title="Liked videos" vids={pick(s.liked)} to={seeAll("LL")} />
      <section>
        <h2 className="mb-4 flex items-center gap-3 font-display text-xl font-semibold"><ListVideo className="h-6 w-6" /> Playlists</h2>
        {s.playlists.length === 0 && <p className="text-sm text-muted-foreground">Use "Save" on any video to create a playlist.</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {s.playlists.map((p) => {
            const first = getVideo(s, p.videoIds[0] ?? "");
            return (
              <Link key={p.id} to="/playlist/$id" params={{ id: p.id }} className="block">
                <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                  {first && <img src={first.thumbnail} alt="" className="h-full w-full object-cover" />}
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-overlay/80 px-1.5 text-xs text-overlay-foreground">{p.videoIds.length} videos</span>
                </div>
                <p className="mt-2 font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">View full playlist</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
