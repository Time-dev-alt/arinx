import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { Loading } from "@/components/common";
import { Empty, VideoRow } from "@/components/VideoCard";
import { CategoryLinks, VideoLinks } from "@/components/SeoLinks";
import { pageHead } from "@/lib/format";
import { publicVideosQuery, type Video } from "@/lib/api";
import { publicCatalog } from "@/lib/catalog.functions";
import { breadcrumbJsonLd, categoryJsonLd, itemListJsonLd } from "@/lib/seo";
import { canonicalUrl, categoryPath, PUBLIC_CATEGORIES } from "@/lib/site";

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const isKnown = (value: string) =>
  PUBLIC_CATEGORIES.some((category) => category.toLowerCase() === value.toLowerCase());

export const Route = createFileRoute("/category/$category")({
  staleTime: 60_000,
  loader: () => publicCatalog({ data: { limit: 80 } }),
  head: ({ params, loaderData }) => {
    const name = titleCase(params.category);
    const videos = (loaderData?.videos ?? []).filter(
      (v: Video) => v.category.toLowerCase() === params.category.toLowerCase(),
    );
    return pageHead(
      `${name} videos — watch the best ${name.toLowerCase()} content on ArinX`,
      `Watch and discover ${name.toLowerCase()} videos on ArinX. Browse the newest uploads, creators and Shorts in ${name} — free and open source.`,
      {
        path: categoryPath(params.category),
        noindex: !isKnown(params.category),
        jsonLd: [
          categoryJsonLd(name, videos.length),
          itemListJsonLd(
            videos.map((v) => ({ id: v.id, title: v.title })),
            `${name} videos on ArinX`,
            canonicalUrl(categoryPath(params.category)),
          ),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: `${name} videos`, path: categoryPath(params.category) },
          ]),
        ],
      },
    );
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { category } = Route.useParams();
  const catalog = Route.useLoaderData();
  const { data: all, isLoading } = useQuery({
    ...publicVideosQuery(),
    initialData: catalog?.videos,
  });
  if (isLoading || !all) return <Loading />;
  const name = titleCase(category);
  const vids = all
    .filter((v) => v.category.toLowerCase() === category.toLowerCase())
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-12">
      <h1 className="mb-2 flex items-center gap-3 font-display text-3xl font-bold">
        <LayoutGrid className="h-9 w-9 text-primary" /> {name} videos
      </h1>
      <p className="mb-5 text-sm text-muted-foreground">
        The latest {name.toLowerCase()} uploads on ArinX — {vids.length} videos to watch right now.
      </p>
      <CategoryLinks active={category.toLowerCase()} className="mb-6" />
      <div className="mt-6 space-y-4">
        {vids.length === 0 && (
          <Empty
            title={`No ${name.toLowerCase()} videos yet`}
            text="Be the first to upload in this category."
          />
        )}
        {vids.map((v) => (
          <VideoRow key={v.id} v={v} />
        ))}
      </div>
      <VideoLinks
        title={`More ${name.toLowerCase()} videos`}
        videos={vids.map((v) => ({ id: v.id, title: v.title }))}
        className="mt-8"
      />
      <p className="mt-8 text-sm text-muted-foreground">
        Looking for something else?{" "}
        <Link to="/" className="text-primary hover:underline">
          Browse the home feed
        </Link>{" "}
        or{" "}
        <Link to="/trending" className="text-primary hover:underline">
          see what&apos;s trending
        </Link>
        .
      </p>
    </div>
  );
}
