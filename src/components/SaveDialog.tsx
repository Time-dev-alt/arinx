import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { actions, useAuth, useUserData } from "@/lib/api";

export function SaveDialog({ videoId, open, onOpenChange }: { videoId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { uid } = useAuth();
  const u = useUserData();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["me"] });
  if (!uid) return null;

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    const { data } = await supabase.from("playlists").insert({ owner_id: uid, name: n }).select("id").single();
    if (data) await supabase.from("playlist_items").insert({ playlist_id: data.id, video_id: videoId });
    setName("");
    refresh();
  };
  const toggleItem = async (pid: string, on: boolean) => {
    if (on) await supabase.from("playlist_items").delete().eq("playlist_id", pid).eq("video_id", videoId);
    else await supabase.from("playlist_items").insert({ playlist_id: pid, video_id: videoId });
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Save video to…</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <label className="flex items-center gap-3">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={u.watchLater.includes(videoId)} onChange={async () => { await actions.toggleWatchLater(uid, videoId, u.watchLater.includes(videoId)); refresh(); }} />
            Watch later
          </label>
          {u.playlists.map((p) => {
            const on = p.videoIds.includes(videoId);
            return (
              <label key={p.id} className="flex items-center gap-3">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={on} onChange={() => toggleItem(p.id, on)} />
                {p.name}
              </label>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2 border-t border-border pt-4">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="New playlist name" className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
          <button onClick={create} className="flex items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" /> Create</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
