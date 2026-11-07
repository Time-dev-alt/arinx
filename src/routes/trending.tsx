import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { Loading, Pills } from "@/components/common";
import { CategoryLinks } from "@/components/SeoLinks";
import { Empty, VideoRow } from "@/components/VideoCard";
import { pageHead } from "@/lib/format";
import { publicVideosQuery, type Video } from "@/lib/api";
import { publicCatalog } from "@/lib/catalog.functions";
import { withinPeriod } from "@/lib/growth";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";
import { canonicalUrl } from "@/lib/site";

const PERIODS = ["Now", "Today", "This week", "This month", "This year"] as const;
const PERIOD_DAYS: Record<string, number> = {
  Today: 1,
  "This week": 7,
  "This month": 31,
  "This year": 366,
};

export const Route = createFileRoute("/trending")({
  validateSearch: (s: Record<string, unknown>): { period?: string } => ({
    period:
      typeof s.period === "string" && (PERIODS as readonly string[]).includes(s.period)
        ? s.period
        : undefined,
  }),
  staleTime: 60_000,
  loader: () => publicCatalog({ data: { limit: 80 } }),
  head: ({ loaderData }) =>
    pageHead(
      "Trending videos on ArinX — what's popular now",
      "See the videos everyone is watching right now on ArinX: trending music, gaming, tech, cooking, Shorts and more, updated continuously.",
      {
        path: "/trending",
        jsonLd: [
          itemListJsonLd(
            (loaderData?.videos ?? []).map((v: Video) => ({ id: v.id, title: v.title })),
            "Trending videos on ArinX",
            canonicalUrl("/trending"),
          ),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Trending", path: "/trending" },
          ]),
        ],
      },
    ),
  component: Trending,
});

function Trending() {
  const { period = "Now" } = Route.useSearch();
  const nav = useNavigate();
  const catalog = Route.useLoaderData();
  const { data: all, isLoading } = useQuery({
    ...publicVideosQuery(),
    initialData: catalog?.videos,
  });
  if (isLoading || !all) return <Loading />;
  const days = PERIOD_DAYS[period];
  const vids = all
    .filter((v) => !v.isShort && (days === undefined || withinPeriod(v.publishedAt, days)))
    .map((v) => ({
      v,
      score: v.views / Math.max(1, (Date.now() - +new Date(v.publishedAt)) / 86400000 + 2),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-12">
      <h1 className="mb-2 flex items-center gap-3 font-display text-3xl font-bold">
        <Flame className="h-9 w-9 text-primary" /> Trending on ArinX
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        The most-watched uploads, ranked by views and freshness.
      </p>
      <Pills
        items={[...PERIODS]}
        value={period}
        onChange={(p) => nav({ to: "/trending", search: p === "Now" ? {} : { period: p } })}
      />
      <div className="mt-6 space-y-4">
        {vids.length === 0 && (
          <Empty title="Nothing trending yet" text="Check back once more videos are uploaded." />
        )}
        {vids.map(({ v }, i) => (
          <div key={v.id} className="flex items-start gap-3">
            <span className="w-6 pt-2 text-right font-display text-lg font-bold text-muted-foreground">
              {i + 1}
            </span>
            <div className="flex-1">
              <VideoRow v={v} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 border-t border-border pt-6">
        <h2 className="mb-3 font-display text-xl font-semibold">Trending by category</h2>
        <CategoryLinks />
        <p className="mt-6 text-sm text-muted-foreground">
          Back to{" "}
          <Link to="/" className="text-primary hover:underline">
            the home feed
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
