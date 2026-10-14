import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Empty, ShortCard, VideoRow } from "@/components/VideoCard";
import { Avatar, Loading, SubscribeButton } from "@/components/common";
import { compact, pageHead } from "@/lib/format";
import { publicVideosQuery, searchChannelsQuery } from "@/lib/api";
import { cn } from "@/lib/utils";

type Search = { q?: string; type?: string; date?: string; duration?: string };

export const Route = createFileRoute("/results")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === "string" ? s.q : undefined,
    type: typeof s.type === "string" ? s.type : undefined,
    date: typeof s.date === "string" ? s.date : undefined,
    duration: typeof s.duration === "string" ? s.duration : undefined,
  }),
  head: () => pageHead("Search", "Search videos, Shorts and channels on ArinX."),
  component: Results,
});

const FILTERS = {
  date: [["any", "Any time"], ["today", "Today"], ["week", "This week"], ["month", "This month"], ["year", "This year"]],
  type: [["all", "All"], ["video", "Video"], ["short", "Shorts"], ["channel", "Channel"]],
  duration: [["any", "Any length"], ["short", "Under 4 minutes"], ["medium", "4–20 minutes"], ["long", "Over 20 minutes"]],
} as const;
const DAYS: Record<string, number> = { today: 1, week: 7, month: 31, year: 366 };

function Results() {
  const search = Route.useSearch();
  const { q = "", type = "all", date = "any", duration = "any" } = search;
  const nav = useNavigate();
  const [showF, setShowF] = useState(false);
  const { data: all, isLoading } = useQuery(publicVideosQuery());
  const { data: chResults = [] } = useQuery(searchChannelsQuery(q));
  if (isLoading || !all) return <Loading />;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (txt: string) => terms.every((t) => txt.toLowerCase().includes(t));

  const channels = type === "all" || type === "channel" ? chResults : [];
  let vids = type === "channel" ? [] : all.filter((v) => matches(`${v.title} ${v.tags.join(" ")} ${v.category} ${v.channel.name} ${v.description}`));
  if (type === "video") vids = vids.filter((v) => !v.isShort);
  if (type === "short") vids = vids.filter((v) => v.isShort);
  if (DAYS[date]) vids = vids.filter((v) => Date.now() - +new Date(v.publishedAt) <= DAYS[date] * 86400000);
  if (duration === "short") vids = vids.filter((v) => v.duration < 240);
  if (duration === "medium") vids = vids.filter((v) => v.duration >= 240 && v.duration <= 1200);
  if (duration === "long") vids = vids.filter((v) => v.duration > 1200);
  vids.sort((a, b) => b.views - a.views);
  const shorts = vids.filter((v) => v.isShort);
  const longs = vids.filter((v) => !v.isShort);

  const set = (k: keyof Search, val: string) => nav({ to: "/results", search: { ...search, [k]: val } });

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 pb-12">
      <button onClick={() => setShowF((x) => !x)} className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium hover:bg-accent">
        <SlidersHorizontal className="h-5 w-5" /> Filters
      </button>
      {showF && (
        <div className="mt-2 grid gap-6 border-b border-border pb-4 sm:grid-cols-3">
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
            <div key={k}>
              <p className="border-b border-border pb-2 text-xs font-bold uppercase tracking-wide">{k === "date" ? "Upload date" : k}</p>
              {FILTERS[k].map(([val, label]) => {
                const cur = { date, type, duration }[k];
                return (
                  <button key={val} onClick={() => set(k, val)} className={cn("block py-1.5 text-sm", cur === val ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 space-y-4">
        {channels.map((c) => (
          <div key={c.id} className="flex items-center gap-6 border-b border-border py-4">
            <Link to="/channel/$handle" params={{ handle: c.handle }} className="flex w-full max-w-[360px] justify-center sm:w-[45%]">
              <Avatar ch={c} className="h-24 w-24 text-4xl sm:h-32 sm:w-32" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link to="/channel/$handle" params={{ handle: c.handle }} className="text-lg font-semibold">{c.name}</Link>
              <p className="text-xs text-muted-foreground">@{c.handle} · {compact(c.subscribers)} subscribers</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.bio}</p>
            </div>
            <SubscribeButton channelId={c.id} />
          </div>
        ))}
        {shorts.length > 0 && type !== "video" && (
          <div className="no-scrollbar flex gap-3 overflow-x-auto py-2">{shorts.map((v) => <ShortCard key={v.id} v={v} />)}</div>
        )}
        {longs.map((v) => <VideoRow key={v.id} v={v} />)}
        {channels.length === 0 && vids.length === 0 && <Empty title="No results found" text="Try different keywords or remove search filters." />}
      </div>
    </div>
  );
}
