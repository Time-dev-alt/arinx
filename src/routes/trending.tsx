import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Flame } from "lucide-react";
import { Loading, Pills } from "@/components/common";
import { Empty, VideoRow } from "@/components/VideoCard";
import { pageHead } from "@/lib/format";
import { publicVideosQuery } from "@/lib/api";

export const Route = createFileRoute("/trending")({
  head: () => pageHead("Trending", "See what's trending on ArinX right now across music, gaming and more."),
  component: Trending,
});

const TABS = ["Now", "Music", "Gaming", "Film"];

function Trending() {
  const { data: all, isLoading } = useQuery(publicVideosQuery());
  const [tab, setTab] = useState("Now");
  if (isLoading || !all) return <Loading />;
  const vids = all
    .filter((v) => !v.isShort && (tab === "Now" || v.category === tab))
    .map((v) => ({ v, score: v.views / Math.max(1, (Date.now() - +new Date(v.publishedAt)) / 86400000 + 2) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-12">
      <h1 className="mb-4 flex items-center gap-3 font-display text-3xl font-bold"><Flame className="h-9 w-9 text-primary" /> Trending</h1>
      <Pills items={TABS} value={tab} onChange={setTab} />
      <div className="mt-6 space-y-4">
        {vids.length === 0 && <Empty title="Nothing trending yet" text="Check back once more videos are uploaded." />}
        {vids.map(({ v }, i) => (
          <div key={v.id} className="flex items-start gap-3">
            <span className="w-6 pt-2 text-right font-display text-lg font-bold text-muted-foreground">{i + 1}</span>
            <div className="flex-1"><VideoRow v={v} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
