import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Zap } from "lucide-react";
import { CATEGORIES, publicVideosQuery, recommend, useUserData } from "@/lib/api";
import { pageHead } from "@/lib/format";
import { Empty, ShortCard } from "@/components/VideoCard";
import { Grid, Loading, Pills } from "@/components/common";
import { AdSlot } from "@/components/AdSlot";

export const Route = createFileRoute("/")({
  head: () => pageHead("Home", "Personalized video recommendations, trending picks and Shorts on ArinX."),
  component: Index,
});

function Index() {
  const u = useUserData();
  const { data: all, isLoading } = useQuery(publicVideosQuery());
  const [cat, setCat] = useState("All");
  if (isLoading || !all) return <Loading />;
  let vids = recommend(all, u);
  if (cat === "Recently uploaded") vids = [...vids].sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  else if (cat !== "All") vids = vids.filter((v) => v.category === cat);
  const shorts = all.filter((v) => v.isShort && (cat === "All" || v.category === cat)).slice(0, 12);
  if (!all.length)
    return (
      <Empty title="No videos yet" text="Be the first to upload a video to ArinX.">
        <Link to="/studio/upload" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">Upload a video</Link>
      </Empty>
    );
  return (
    <div className="px-4 pb-12 sm:px-6">
      <div className="sticky top-14 z-20 -mx-4 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Pills items={["All", ...CATEGORIES, "Recently uploaded"]} value={cat} onChange={setCat} />
      </div>
      <Grid vids={vids.slice(0, 8)} />
      {shorts.length > 0 && (
        <section className="my-8 border-y border-border py-6">
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold"><Zap className="h-6 w-6 text-primary" /> Shorts</h2>
          <div className="no-scrollbar flex gap-4 overflow-x-auto">{shorts.map((v) => <ShortCard key={v.id} v={v} />)}</div>
        </section>
      )}
      <Grid vids={vids.slice(8)} />
    </div>
  );
}
