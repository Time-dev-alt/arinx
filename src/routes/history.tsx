import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Trash2, X } from "lucide-react";
import { Empty, VideoRow } from "@/components/VideoCard";
import { pageHead } from "@/lib/format";
import { getVideo, setState, useAppState } from "@/lib/store";

export const Route = createFileRoute("/history")({
  head: () => pageHead("Watch history", "Videos you've watched on ArinX."),
  component: HistoryPage,
});

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function HistoryPage() {
  const s = useAppState();
  const [q, setQ] = useState("");
  const items = s.history
    .map((h) => ({ h, v: getVideo(s, h.id) }))
    .filter((x) => x.v && x.v.title.toLowerCase().includes(q.toLowerCase()));
  const groups: Record<string, typeof items> = {};
  for (const it of items) (groups[dayLabel(it.h.at)] ??= []).push(it);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 pb-12 lg:grid-cols-[1fr_280px]">
      <div>
        <h1 className="mb-6 font-display text-3xl font-bold">Watch history</h1>
        {items.length === 0 && <Empty title="No watch history" text="Videos you watch will show up here." />}
        {Object.entries(groups).map(([label, list]) => (
          <section key={label} className="mb-8">
            <h2 className="mb-4 font-semibold">{label}</h2>
            <div className="space-y-4">
              {list.map(({ h, v }) => (
                <VideoRow
                  key={h.id}
                  v={v!}
                  extra={
                    <button aria-label="Remove from history" onClick={() => setState((st) => ({ history: st.history.filter((x) => x.id !== h.id) }))} className="mt-2 rounded-full p-1.5 text-muted-foreground hover:bg-accent">
                      <X className="h-4 w-4" />
                    </button>
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <aside className="space-y-4 lg:pt-16">
        <label className="flex items-center gap-3 border-b border-border pb-2">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search watch history" className="flex-1 bg-transparent text-sm outline-none" />
        </label>
        <button onClick={() => setState(() => ({ history: [] }))} className="flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium hover:bg-accent">
          <Trash2 className="h-5 w-5" /> Clear all watch history
        </button>
      </aside>
    </div>
  );
}
