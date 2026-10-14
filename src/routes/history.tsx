import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Trash2, X } from "lucide-react";
import { Empty, VideoRow } from "@/components/VideoCard";
import { SignInPrompt } from "@/components/common";
import { pageHead } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserData, videosByIdsQuery } from "@/lib/api";

export const Route = createFileRoute("/history")({
  head: () => pageHead("Watch history", "Videos you've watched on ArinX."),
  component: HistoryPage,
});

function dayLabel(iso: string) {
  const d = new Date(iso);
  const diff = Math.floor((new Date(new Date().toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function HistoryPage() {
  const { uid, ready } = useAuth();
  const u = useUserData();
  const qc = useQueryClient();
  const { data: vids = [] } = useQuery(videosByIdsQuery(u.history.map((h) => h.id)));
  const [q, setQ] = useState("");
  if (ready && !uid) return <SignInPrompt title="Keep track of what you watch" text="Sign in to see your watch history." />;
  const byId = new Map(vids.map((v) => [v.id, v]));
  const items = u.history.map((h) => ({ h, v: byId.get(h.id) })).filter((x) => x.v && x.v.title.toLowerCase().includes(q.toLowerCase()));
  const groups: Record<string, typeof items> = {};
  for (const it of items) (groups[dayLabel(it.h.at)] ??= []).push(it);
  const refresh = () => qc.invalidateQueries({ queryKey: ["me"] });
  const removeOne = async (id: string) => { await supabase.from("watch_history").delete().eq("user_id", uid!).eq("video_id", id); refresh(); };
  const clearAll = async () => { if (!confirm("Clear all watch history?")) return; await supabase.from("watch_history").delete().eq("user_id", uid!); refresh(); };

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
                <VideoRow key={h.id} v={v!} extra={
                  <button aria-label="Remove from history" onClick={() => removeOne(h.id)} className="mt-2 rounded-full p-1.5 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
                } />
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
        <button onClick={clearAll} className="flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium hover:bg-accent">
          <Trash2 className="h-5 w-5" /> Clear all watch history
        </button>
      </aside>
    </div>
  );
}
