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
import { getChannel, getVideo, recommend, setState, toggleIn, useAppState } from "@/lib/store";
import { SEED_VIDEOS } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/watch/$id")({
  head: ({ params }) => {
    const v = SEED_VIDEOS.find((x) => x.id === params.id);
    return pageHead(v?.title ?? "Watch", v ? v.description.split("\n\n")[1] : "Watch videos on ArinX.");
  },
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
  const s = useAppState();
  const nav = useNavigate();
  const v = getVideo(s, id);
  const player = useRef<PlayerHandle>(null);
  const [theater, setTheater] = useState(false);
  const [save, setSave] = useState(false);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    if (!v) return;
    setState((st) => ({ history: [{ id, at: new Date().toISOString() }, ...st.history.filter((h) => h.id !== id)].slice(0, 200) }));
  }, [id, !!v]);

  if (!v) return <Empty title="Video unavailable" text="This video may have been removed or made private." />;
  const c = getChannel(s, v.channelId)!;
  const liked = s.liked.includes(id);
  const disliked = s.disliked.includes(id);
  let related = recommend(s, id);
  const sameCh = related.filter((x) => x.channelId === v.channelId);
  if (filter === `From ${c.name}`) related = sameCh;
  else if (filter === v.category) related = related.filter((x) => x.category === v.category);
  else related = [...related.filter((x) => x.category === v.category), ...related.filter((x) => x.category !== v.category)];
  const next = related[0];

  const sidebar = (
    <aside className="space-y-3">
      <Pills items={["All", `From ${c.name}`, v.category]} value={filter} onChange={setFilter} />
      {related.slice(0, 20).map((r) => <VideoRow key={r.id} v={r} compact />)}
    </aside>
  );

  const main = (
    <div className="min-w-0">
      <h1 className="mt-3 font-display text-xl font-semibold leading-tight">{v.title}</h1>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/channel/$handle" params={{ handle: c.handle }}><img src={c.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /></Link>
          <div>
            <Link to="/channel/$handle" params={{ handle: c.handle }} className="font-semibold">{c.name}</Link>
            <p className="text-xs text-muted-foreground">{subs(c.subscribers + (s.subscriptions.includes(c.id) ? 1 : 0))}</p>
          </div>
          <SubscribeButton channelId={c.id} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-full bg-muted">
            <button
              aria-label="Like"
              onClick={() => setState((st) => ({ liked: toggleIn(st.liked, id), disliked: st.disliked.filter((x) => x !== id) }))}
              className="flex items-center gap-2 border-r border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              <ThumbsUp className={cn("h-5 w-5", liked && "fill-current")} /> {compact(v.likes + (liked ? 1 : 0))}
            </button>
            <button
              aria-label="Dislike"
              onClick={() => setState((st) => ({ disliked: toggleIn(st.disliked, id), liked: st.liked.filter((x) => x !== id) }))}
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
          <button onClick={() => setSave(true)} className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium hover:bg-accent">
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
            <Player ref={player} key={id} src={v.src} poster={v.thumbnail} theater onTheater={() => setTheater(false)} onNext={next ? () => nav({ to: "/watch/$id", params: { id: next.id } }) : undefined} />
          </div>
          <div className="mx-auto grid max-w-[1750px] gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_400px]">
            {main}
            <div className="pt-4">{sidebar}</div>
          </div>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0">
            <Player ref={player} key={id} src={v.src} poster={v.thumbnail} onTheater={() => setTheater(true)} onNext={next ? () => nav({ to: "/watch/$id", params: { id: next.id } }) : undefined} />
            {main}
          </div>
          {sidebar}
        </div>
      )}
    </div>
  );
}
