import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Clock, History, ListVideo, ThumbsUp } from "lucide-react";
import { VideoCard } from "@/components/VideoCard";
import { Avatar, SignInPrompt } from "@/components/common";
import { pageHead } from "@/lib/format";
import { useAuth, useMe, useUserData, videosByIdsQuery, type Video } from "@/lib/api";

export const Route = createFileRoute("/library")({
  head: () => pageHead("Library", "Your history, Watch later, liked videos and playlists on ArinX."),
  component: LibraryPage,
});

function Shelf({ icon, title, to, vids, count }: { icon: ReactNode; title: string; to: ReactNode; vids: Video[]; count: number }) {
  return (
    <section className="border-b border-border pb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-3 font-display text-xl font-semibold">{icon} {title} <span className="text-sm font-normal text-muted-foreground">{count}</span></h2>
        {to}
      </div>
      {vids.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{vids.map((v) => <VideoCard key={v.id} v={v} />)}</div>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      )}
    </section>
  );
}

function LibraryPage() {
  const { uid, ready } = useAuth();
  const { data: me } = useMe();
  const u = useUserData();
  const h = u.history.slice(0, 4).map((x) => x.id);
  const wl = u.watchLater.slice(0, 4);
  const ll = u.liked.slice(0, 4);
  const firsts = u.playlists.map((p) => p.videoIds[0]).filter(Boolean) as string[];
  const { data: vids = [] } = useQuery(videosByIdsQuery([...new Set([...h, ...wl, ...ll, ...firsts])]));
  if (ready && !uid) return <SignInPrompt title="Enjoy your favorite videos" text="Sign in to access videos you've liked or saved." />;
  const byId = new Map(vids.map((v) => [v.id, v]));
  const pick = (ids: string[]) => ids.map((i) => byId.get(i)).filter(Boolean) as Video[];
  const seeAll = (id: string) => <Link to="/playlist/$id" params={{ id }} className="rounded-full px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10">See all</Link>;
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 pb-12">
      <div className="flex items-center gap-4">
        <Avatar ch={me} className="h-20 w-20 text-3xl" />
        <div>
          <h1 className="font-display text-3xl font-bold">{me?.name ?? "Library"}</h1>
          {me && <p className="text-sm text-muted-foreground">@{me.handle} · {u.subscriptions.length} subscriptions · {u.liked.length} likes</p>}
        </div>
      </div>
      <Shelf icon={<History className="h-6 w-6" />} title="History" count={u.history.length} vids={pick(h)} to={<Link to="/history" className="rounded-full px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10">See all</Link>} />
      <Shelf icon={<Clock className="h-6 w-6" />} title="Watch later" count={u.watchLater.length} vids={pick(wl)} to={seeAll("WL")} />
      <Shelf icon={<ThumbsUp className="h-6 w-6" />} title="Liked videos" count={u.liked.length} vids={pick(ll)} to={seeAll("LL")} />
      <section>
        <h2 className="mb-4 flex items-center gap-3 font-display text-xl font-semibold"><ListVideo className="h-6 w-6" /> Playlists</h2>
        {u.playlists.length === 0 && <p className="text-sm text-muted-foreground">Use "Save" on any video to create a playlist.</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {u.playlists.map((p) => {
            const first = byId.get(p.videoIds[0] ?? "");
            return (
              <Link key={p.id} to="/playlist/$id" params={{ id: p.id }} className="block">
                <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                  {first?.thumbnail && <img src={first.thumbnail} alt="" className="h-full w-full object-cover" />}
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
