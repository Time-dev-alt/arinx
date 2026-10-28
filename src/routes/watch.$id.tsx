import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useRef, useState } from "react";
import { Bookmark, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Player, type PlayerHandle } from "@/components/Player";
import { Comments } from "@/components/Comments";
import { SaveDialog } from "@/components/SaveDialog";
import { Empty, VideoRow } from "@/components/VideoCard";
import { Pills, SubscribeButton } from "@/components/common";
import { compact, ago, pageHead, parseTime, subs } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { actions, publicVideosQuery, recommend, useAuth, useRequireAuth, useUserData, videoQuery, videoSrcQuery } from "@/lib/api";
import { Avatar } from "@/components/common";
import { cn } from "@/lib/utils";
import { AdSlot } from "@/components/AdSlot";
import { PrerollAd } from "@/components/PrerollAd";

export const Route = createFileRoute("/watch/$id")({
  head: () => pageHead("Watch", "Watch videos on ArinX."),
  component: Watch,
});

function Description({ text, tags, views, at, onSeek }: { text: string; tags: string[]; views: number; at: string; onSeek: (t: number) => void }) {
  const [open, setOpen] = useState(false);
  const lines = text.split("\n");
  return (
    <div onClick={() => !open && setOpen(true)} className={cn("mt-3 rounded-xl bg-muted p-3 text-sm", !open && "cursor-pointer hover:bg-accent")}>
      <p className="font-semibold">
        {views.toLocaleString()} views · {ago(at)}{" "}
        <span className="text-primary">{tags.map((t) => `#${t.replace(/\s/g, "")}`).join(" ")}</span>
      </p>
      <div className={cn("mt-1 whitespace-pre-wrap", !open && "line-clamp-2")}>
        {lines.map((l, i) => {
          const m = l.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s(.*)$/);
          return (
            <Fragment key={i}>
              {m ? (
                <>
                  <button onClick={(e) => { e.stopPropagation(); onSeek(parseTime(m[1])); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="font-medium text-primary hover:underline">{m[1]}</button> {m[2]}
                </>
              ) : l}
              {"\n"}
            </Fragment>
          );
        })}
      </div>
      {open && (
        <button onClick={(e) => { e.stopPropagation(); setOpen(false); }} className="mt-3 font-semibold">Show less</button>
      )}
      {!open && <span className="font-semibold">...more</span>}
    </div>
  );
}

function Watch() {
  const { id } = Route.useParams();
  const u = useUserData();
  const { uid } = useAuth();
  const qc = useQueryClient();
  const req = useRequireAuth();
  const { data: v, isLoading } = useQuery(videoQuery(id));
  const { data: all = [] } = useQuery(publicVideosQuery());
  const { data: src } = useQuery({ ...videoSrcQuery(v?.videoPath ?? ""), enabled: !!v });
  const nav = useNavigate();
  const player = useRef<PlayerHandle>(null);
  const [theater, setTheater] = useState(false);
  const [adDone, setAdDone] = useState(false);
  const [save, setSave] = useState(false);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    setAdDone(false);
  if (!v) return;
    void actions.recordWatch(uid, id).then(() => qc.invalidateQueries({ queryKey: ["me"] }));
  }, [id, !!v, uid]);

  if (isLoading) return <div className="p-6"><div className="aspect-video animate-pulse rounded-xl bg-muted" /></div>;
  if (isLoading) return <div className="p-6"><div className="aspect-video animate-pulse rounded-xl bg-muted" /></div>;
  if (!v) return <Empty title="Video unavailable" text="This video may have been removed or made private." />;
  const c = v.channel;
  const liked = u.liked.includes(id);
  const disliked = u.disliked.includes(id);
  const react = (val: 1 | -1) => req("rate videos", async (me) => {
    await actions.react(me, id, val, liked ? 1 : disliked ? -1 : 0);
    await Promise.all([qc.invalidateQueries({ queryKey: ["me"] }), qc.invalidateQueries({ queryKey: ["video", id] })]);
  });
  let related = recommend(all, u, id);
  const sameCh = related.filter((x) => x.channelId === v.channelId);
  if (filter === `From ${c.name}`) related = sameCh;
  else if (filter === v.category) related = related.filter((x) => x.category === v.category);
  else related = [...related.filter((x) => x.category === v.category), ...related.filter((x) => x.category !== v.category)];
  const next = related[0];

  const sidebar = (
    <aside className="space-y-3">
      <AdSlot slot="adsterra_sidebar" className="rounded-xl border border-border p-2" />
      <Pills items={["All", `From ${c.name}`, v.category]} value={filter} onChange={setFilter} />
      {related.slice(0, 20).map((r) => <VideoRow key={r.id} v={r} compact />)}
    </aside>
  );

  const main = (
    <div className="min-w-0">
      <h1 className="mt-3 font-display text-xl font-semibold leading-tight">{v.title}</h1>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/channel/$handle" params={{ handle: c.handle }}><Avatar ch={c} className="h-10 w-10" /></Link>
          <div>
            <Link to="/channel/$handle" params={{ handle: c.handle }} className="font-semibold">{c.name}</Link>
            <p className="text-xs text-muted-foreground">{subs(c.subscribers)}</p>
          </div>
          <SubscribeButton channelId={c.id} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-full bg-muted">
            <button
              aria-label="Like"
              onClick={() => react(1)}
              className="flex items-center gap-2 border-r border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              <ThumbsUp className={cn("h-5 w-5", liked && "fill-current")} /> {compact(v.likes)}
            </button>
            <button
              aria-label="Dislike"
              onClick={() => react(-1)}
              className="px-4 py-2 hover:bg-accent"
            >
              <ThumbsDown className={cn("h-5 w-5", disliked && "fill-current")} />
            </button>
          </div>
          <button
            onClick={() => { navigator.clipboard?.writeText(window.location.href); toast("Link copied to clipboard"); }}
            className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            <Share2 className="h-5 w-5" /> Share
          </button>
          <button onClick={() => req("save videos", () => setSave(true))} className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium hover:bg-accent">
            <Bookmark className="h-5 w-5" /> Save
          </button>
        </div>
      </div>
      <Description text={v.description} tags={v.tags} views={v.views} at={v.publishedAt} onSeek={(t) => player.current?.seek(t)} />
      <Comments videoId={id} />
    </div>
  );

  return (
    <div className={cn("mx-auto pb-12", theater ? "" : "max-w-[1750px] px-4 pt-4 sm:px-6")}>
      <SaveDialog videoId={id} open={save} onOpenChange={setSave} />
      {theater ? (
        <>
          <div className="flex justify-center bg-overlay">
            <Player ref={player} key={id} src={src ?? ""} poster={v.thumbnail ?? undefined} theater onTheater={() => setTheater(false)} onNext={next ? () => nav({ to: "/watch/$id", params: { id: next.id } }) : undefined} />
          </div>
          <div className="mx-auto grid max-w-[1750px] gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_400px]">
            {main}
            <div className="pt-4">{sidebar}</div>
          </div>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0">
            <Player ref={player} key={id} src={src ?? ""} poster={v.thumbnail ?? undefined} onTheater={() => setTheater(true)} onNext={next ? () => nav({ to: "/watch/$id", params: { id: next.id } }) : undefined} />
            {main}
          </div>
          {sidebar}
        </div>
      )}
    </div>
  );
}
