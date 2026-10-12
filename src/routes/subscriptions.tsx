import { createFileRoute, Link } from "@tanstack/react-router";
import { Grid } from "@/components/common";
import { Empty } from "@/components/VideoCard";
import { pageHead } from "@/lib/format";
import { getChannels, publicVideos, useAppState } from "@/lib/store";

export const Route = createFileRoute("/subscriptions")({
  head: () => pageHead("Subscriptions", "The latest uploads from channels you subscribe to on ArinX."),
  component: Subs,
});

function Subs() {
  const s = useAppState();
  const chs = getChannels(s).filter((c) => s.subscriptions.includes(c.id));
  const vids = publicVideos(s)
    .filter((v) => !v.isShort && s.subscriptions.includes(v.channelId))
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  return (
    <div className="px-4 py-4 pb-12 sm:px-6">
      <div className="no-scrollbar mb-6 flex gap-6 overflow-x-auto">
        {chs.map((c) => (
          <Link key={c.id} to="/channel/$handle" params={{ handle: c.handle }} className="flex w-20 shrink-0 flex-col items-center gap-2 text-center text-xs">
            <img src={c.avatar} alt="" className="h-16 w-16 rounded-full object-cover" />
            <span className="line-clamp-1">{c.name}</span>
          </Link>
        ))}
      </div>
      <h1 className="mb-2 font-display text-xl font-semibold">Latest</h1>
      {vids.length ? <Grid vids={vids} /> : <Empty title="Don't miss new videos" text="Subscribe to channels to see their latest uploads here." />}
    </div>
  );
}
