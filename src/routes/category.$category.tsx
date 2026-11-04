import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { Loading } from "@/components/common";
import { Empty, VideoRow } from "@/components/VideoCard";
import { pageHead } from "@/lib/format";
import { publicVideosQuery } from "@/lib/api";

export const Route = createFileRoute("/category/$category")({
  head: ({ params }) => {
    const name = params.category.charAt(0).toUpperCase() + params.category.slice(1);
    return pageHead(
      `${name} videos`,
      `Watch the latest ${name.toLowerCase()} videos on ArinX.`,
      `/category/${encodeURIComponent(params.category)}`,
    );
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { category } = Route.useParams();
  const { data: all, isLoading } = useQuery(publicVideosQuery());
  if (isLoading || !all) return <Loading />;
  const name = category.charAt(0).toUpperCase() + category.slice(1);
  const vids = all
    .filter((v) => v.category.toLowerCase() === category.toLowerCase())
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-12">
      <h1 className="mb-4 flex items-center gap-3 font-display text-3xl font-bold">
        <LayoutGrid className="h-9 w-9 text-primary" /> {name}
      </h1>
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
      <p className="mt-8 text-sm text-muted-foreground">
        Looking for something else? <Link to="/" className="text-primary hover:underline">Browse the home feed</Link> or{" "}
        <Link to="/trending" className="text-primary hover:underline">see what's trending</Link>.
      </p>
    </div>
  );
}
