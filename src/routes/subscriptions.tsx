import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Grid, Loading, SignInPrompt } from "@/components/common";
import { Empty } from "@/components/VideoCard";
import { pageHead } from "@/lib/format";
import { channelsByIdsQuery, publicVideosQuery, useAuth, useUserData } from "@/lib/api";

export const Route = createFileRoute("/subscriptions")({
  head: () =>
    pageHead("Subscriptions", "The latest uploads from channels you subscribe to on ArinX.", {
      noindex: true,
    }),
  component: Subs,
});

function Subs() {
  const { uid, ready } = useAuth();
  const u = useUserData();
  const { data: chs = [] } = useQuery(channelsByIdsQuery(u.subscriptions));
  const { data: all, isLoading } = useQuery(publicVideosQuery());
  if (ready && !uid)
    return (
      <SignInPrompt
        title="Don't miss new videos"
        text="Sign in to see updates from your favorite channels."
      />
    );
  if (isLoading || !all) return <Loading />;
  const vids = all.filter((v) => !v.isShort && u.subscriptions.includes(v.channelId));
  return (
    <div className="px-4 py-4 pb-12 sm:px-6">
      <div className="no-scrollbar mb-6 flex gap-6 overflow-x-auto">
        {chs.map((c) => (
          <Link
            key={c.id}
            to="/channel/$handle"
            params={{ handle: c.handle }}
            className="flex w-20 shrink-0 flex-col items-center gap-2 text-center text-xs"
          >
            <Avatar ch={c} className="h-16 w-16 text-xl" />
            <span className="line-clamp-1">{c.name}</span>
          </Link>
        ))}
      </div>
      <h1 className="mb-2 font-display text-xl font-semibold">Latest</h1>
      {vids.length ? (
        <Grid vids={vids} />
      ) : (
        <Empty
          title="Don't miss new videos"
          text="Subscribe to channels to see their latest uploads here."
        />
      )}
    </div>
  );
}
