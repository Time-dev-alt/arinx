import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setState, toggleIn, uid, useAppState } from "@/lib/store";
import { Plus } from "lucide-react";

export function SaveDialog({ videoId, open, onOpenChange }: { videoId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const s = useAppState();
  const [name, setName] = useState("");
  const create = () => {
    const n = name.trim();
    if (!n) return;
    setState((st) => ({
      playlists: [...st.playlists, { id: "PL" + uid(), name: n, videoIds: [videoId], createdAt: new Date().toISOString() }],
    }));
    setName("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save video to…</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <label className="flex items-center gap-3">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={s.watchLater.includes(videoId)} onChange={() => setState((st) => ({ watchLater: toggleIn(st.watchLater, videoId) }))} />
            Watch later
          </label>
          {s.playlists.map((p) => (
            <label key={p.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={p.videoIds.includes(videoId)}
                onChange={() =>
                  setState((st) => ({
                    playlists: st.playlists.map((x) => (x.id === p.id ? { ...x, videoIds: toggleIn(x.videoIds, videoId) } : x)),
                  }))
                }
              />
              {p.name}
            </label>
          ))}
        </div>
        <div className="mt-2 flex gap-2 border-t border-border pt-4">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="New playlist name" className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
          <button onClick={create} className="flex items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" /> Create</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
