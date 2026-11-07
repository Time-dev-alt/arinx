import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Trash2, X } from "lucide-react";
import { Empty, VideoRow } from "@/components/VideoCard";
import { SignInPrompt } from "@/components/common";
import { pageHead } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { actions, useAuth, useUserData, videosByIdsQuery } from "@/lib/api";

export const Route = createFileRoute("/playlist/$id")({
  head: ({ params }) =>
    pageHead(
      params.id === "WL" ? "Watch later" : params.id === "LL" ? "Liked videos" : "Playlist",
      "A playlist of videos on ArinX.",
      { noindex: true },
    ),
  component: PlaylistPage,
});

function PlaylistPage() {
  const { id } = Route.useParams();
  const { uid, ready } = useAuth();
  const u = useUserData();
  const qc = useQueryClient();
  const nav = useNavigate();
  const custom = u.playlists.find((p) => p.id === id);
  const name = id === "WL" ? "Watch later" : id === "LL" ? "Liked videos" : custom?.name;
  const ids = (id === "WL" ? u.watchLater : id === "LL" ? u.liked : custom?.videoIds) ?? [];
  const { data: vids = [] } = useQuery(videosByIdsQuery(ids));
  if (ready && !uid)
    return (
      <SignInPrompt title="Your playlists" text="Sign in to see your saved videos and playlists." />
    );
  if (!name)
    return <Empty title="Playlist not found" text="This playlist doesn't exist or was deleted." />;
  const refresh = () => qc.invalidateQueries({ queryKey: ["me"] });

  const remove = async (vid: string) => {
    if (id === "WL") await actions.toggleWatchLater(uid!, vid, true);
    else if (id === "LL") await actions.react(uid!, vid, 1, 1);
    else await supabase.from("playlist_items").delete().eq("playlist_id", id).eq("video_id", vid);
    refresh();
  };
  const del = async () => {
    if (!confirm("Delete this playlist?")) return;
    await supabase.from("playlist_items").delete().eq("playlist_id", id);
    await supabase.from("playlists").delete().eq("id", id);
    await refresh();
    nav({ to: "/library" });
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 pb-12 lg:grid-cols-[360px_1fr]">
      <aside className="h-fit rounded-2xl bg-gradient-to-b from-primary/30 to-card p-6 lg:sticky lg:top-20">
        {vids[0]?.thumbnail ? (
          <img
            src={vids[0].thumbnail}
            alt=""
            className="aspect-video w-full rounded-xl object-cover"
          />
        ) : (
          <div className="aspect-video rounded-xl bg-muted" />
        )}
        <h1 className="mt-4 font-display text-2xl font-bold">{name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{vids.length} videos</p>
        <div className="mt-4 flex gap-2">
          {vids[0] && (
            <Link
              to="/watch/$id"
              params={{ id: vids[0].id }}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-foreground py-2 text-sm font-medium text-background"
            >
              <Play className="h-4 w-4 fill-current" /> Play all
            </Link>
          )}
          {custom && (
            <button
              aria-label="Delete playlist"
              onClick={del}
              className="rounded-full bg-muted p-2.5 hover:bg-accent"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>
      <div className="space-y-3">
        {vids.length === 0 && (
          <Empty title="No videos yet" text="Videos you save will show up here." />
        )}
        {vids.map((v, i) => (
          <div key={v.id} className="flex items-center gap-3">
            <span className="w-5 text-sm text-muted-foreground">{i + 1}</span>
            <div className="flex-1">
              <VideoRow v={v} compact />
            </div>
            <button
              aria-label="Remove"
              onClick={() => remove(v.id)}
              className="rounded-full p-2 hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
