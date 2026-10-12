import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Zap } from "lucide-react";
import { CATEGORIES } from "@/lib/data";
import { pageHead } from "@/lib/format";
import { publicVideos, recommend, useAppState } from "@/lib/store";
import { ShortCard } from "@/components/VideoCard";
import { Grid, Pills } from "@/components/common";

export const Route = createFileRoute("/")({
  head: () => pageHead("Home", "Personalized video recommendations, trending picks and Shorts on ArinX."),
  component: Index,
});

function Index() {
  const s = useAppState();
  const [cat, setCat] = useState("All");
  const pills = ["All", ...CATEGORIES, "Recently uploaded"];
  let vids = recommend(s);
  if (cat === "Recently uploaded") vids = [...vids].sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  else if (cat !== "All") vids = vids.filter((v) => v.category === cat);
  const shorts = publicVideos(s).filter((v) => v.isShort && (cat === "All" || v.category === cat)).slice(0, 12);
  const first = vids.slice(0, 8);
  const rest = vids.slice(8);

  return (
    <div className="px-4 pb-12 sm:px-6">
      <div className="sticky top-14 z-20 -mx-4 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Pills items={pills} value={cat} onChange={setCat} />
      </div>
      <Grid vids={first} />
      {shorts.length > 0 && (
        <section className="my-8 border-y border-border py-6">
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold"><Zap className="h-6 w-6 text-primary" /> Shorts</h2>
          <div className="no-scrollbar flex gap-4 overflow-x-auto">{shorts.map((v) => <ShortCard key={v.id} v={v} />)}</div>
        </section>
      )}
      <Grid vids={rest} />
    </div>
  );
}

