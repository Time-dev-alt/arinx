import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Player } from "@/components/Player";
import { PrerollAd } from "@/components/PrerollAd";
import { videoQuery, videoSrcQuery } from "@/lib/api";
import { pageHead } from "@/lib/format";
import { startSeconds } from "@/lib/watch-tools";

export const Route = createFileRoute("/embed/$id")({
  validateSearch: (search: Record<string, unknown>) => ({ t: startSeconds(search.t) }),
  head: () => pageHead("Embedded video", "Embedded video playback on ArinX."),
  component: Embed,
});

function Embed() {
  const { id } = Route.useParams();
  const { t } = Route.useSearch();
  const { data: video, isLoading } = useQuery(videoQuery(id));
  const { data: src } = useQuery({ ...videoSrcQuery(video?.videoPath ?? ""), enabled: !!video });
  const [finishedAd, setFinishedAd] = useState<string | null>(null);
  if (isLoading) return <div className="aspect-video animate-pulse bg-muted" />;
  if (!video) return <p className="p-6 text-center text-muted-foreground">Video unavailable</p>;
  return <div className="flex min-h-screen items-center bg-overlay">{finishedAd === id ? <Player key={id} src={src ?? ""} poster={video.thumbnail ?? undefined} startTime={t} /> : <PrerollAd key={id} onDone={() => setFinishedAd(id)} />}</div>;
}