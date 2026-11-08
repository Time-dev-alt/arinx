import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Zap } from "lucide-react";
import { CATEGORIES, publicVideosQuery, recommend, useUserData, type Video } from "@/lib/api";
import { pageHead } from "@/lib/format";
import { Empty, ShortCard } from "@/components/VideoCard";
import { Grid, Loading, Pills } from "@/components/common";
import { AdSlot } from "@/components/AdSlot";
import { publicCatalog } from "@/lib/catalog.functions";
import { CreatorLinks, CategoryLinks, VideoLinks } from "@/components/SeoLinks";
import { breadcrumbJsonLd, videoCarouselJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/")({
  staleTime: 60_000,
  loader: () => publicCatalog({ data: { limit: 60 } }),
  head: ({ loaderData }) =>
    pageHead(
      "Watch, share and create videos online | ArinX",
      "Discover trending videos, Shorts and creators on ArinX, a free open-source video platform. Browse music, gaming, tech, cooking, travel and more.",
      {
        path: "/",
        jsonLd: [
          videoCarouselJsonLd(loaderData?.videos ?? [], "Latest videos on ArinX", SITE_URL),
          breadcrumbJsonLd([{ name: "Home", path: "/" }]),
        ],
      },
    ),
  component: Index,
});

function Index() {
  const catalog = Route.useLoaderData();
  const u = useUserData();
  const { data: all, isLoading } = useQuery({
    ...publicVideosQuery(),
    initialData: catalog?.videos,
  });
  const [cat, setCat] = useState("All");
  if (isLoading || !all) return <Loading />;
  let vids = recommend(all, u);
  if (cat === "Recently uploaded")
    vids = [...vids].sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  else if (cat !== "All") vids = vids.filter((v) => v.category === cat);
  const shorts = all.filter((v) => v.isShort && (cat === "All" || v.category === cat)).slice(0, 12);
  if (!all.length)
    return (
      <Empty title="No videos yet" text="Be the first to upload a video to ArinX.">
        <Link
          to="/studio/upload"
          className="mt-6 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
        >
          Upload a video
        </Link>
      </Empty>
    );
  return (
    <div className="px-4 pb-12 sm:px-6">
      <h1 className="sr-only">ArinX — watch, share and create videos online</h1>
      <div className="sticky top-14 z-20 -mx-4 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Pills items={["All", ...CATEGORIES, "Recently uploaded"]} value={cat} onChange={setCat} />
      </div>
      <h2 className="sr-only">Recommended videos</h2>
      <Grid vids={vids.slice(0, 8)} />
      <AdSlot slot="adsterra_feed" className="my-6" />
      {shorts.length > 0 && (
        <section className="my-8 border-y border-border py-6">
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold">
            <Zap className="h-6 w-6 text-primary" /> Shorts
          </h2>
          <div className="no-scrollbar flex gap-4 overflow-x-auto">
            {shorts.map((v) => (
              <ShortCard key={v.id} v={v} />
            ))}
          </div>
        </section>
      )}
      <Grid vids={vids.slice(8)} />

      <section className="mt-12 space-y-4 border-t border-border pt-8">
        <h2 className="font-display text-xl font-semibold">Explore ArinX</h2>
        <p className="text-sm text-muted-foreground">
          Browse every topic, find new creators, or jump straight to the latest uploads.
        </p>
        <CategoryLinks />
        <div className="grid gap-4 md:grid-cols-2">
          <CreatorLinks
            title="Creators to discover"
            channels={(catalog?.channels ?? []).map((c) => ({ handle: c.handle, name: c.name }))}
          />
          <VideoLinks
            title="Latest uploads"
            videos={(catalog?.videos ?? []).slice(0, 16).map((v) => ({ id: v.id, title: v.title }))}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          What&apos;s popular right now?{" "}
          <Link to="/trending" className="text-primary hover:underline">
            See trending videos
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
