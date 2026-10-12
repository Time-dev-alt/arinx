import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, Clock, Users, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { StudioNav } from "@/components/StudioNav";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORIES, ME_ID, hash, type Video, type Visibility } from "@/lib/data";
import { compact, duration, pageHead } from "@/lib/format";
import { allVideos, getChannel, setState, useAppState } from "@/lib/store";

export const Route = createFileRoute("/studio/")({
  head: () => pageHead("Studio", "Manage your videos and see channel analytics in ArinX Studio."),
  component: Studio,
});

function series(seed: string, base: number) {
  let h = hash(seed);
  return Array.from({ length: 28 }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    return Math.round(base * (0.6 + (h % 1000) / 1000) * (1 + i / 40));
  });
}

function Stat({ icon, label, value, data }: { icon: React.ReactNode; label: string; value: string; data: number[] }) {
  const max = Math.max(...data);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 100},${40 - (d / max) * 36}`).join(" ");
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">{icon} {label}</p>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-3 h-16 w-full text-primary">
        <polyline points={`0,40 ${pts} 100,40`} className="fill-primary/15" />
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="text-xs text-muted-foreground">Last 28 days</p>
    </div>
  );
}

function EditDialog({ v, onClose }: { v: Video; onClose: () => void }) {
  const [f, setF] = useState({ title: v.title, description: v.description, category: v.category, visibility: v.visibility, tags: v.tags.join(", ") });
  const save = () => {
    const patch = { ...f, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) };
    setState((st) =>
      st.uploads.some((u) => u.id === v.id)
        ? { uploads: st.uploads.map((u) => (u.id === v.id ? { ...u, ...patch } : u)) }
        : { edits: { ...st.edits, [v.id]: { ...st.edits[v.id], ...patch } } },
    );
    toast("Changes saved");
    onClose();
  };
  const field = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Video details</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">Title<input className={field} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="block text-sm">Description<textarea rows={5} className={field} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <label className="block text-sm">Tags (comma separated)<input className={field} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Category
              <select className={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="block text-sm">Visibility
              <select className={field} value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as Visibility })}>
                <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
            <button onClick={save} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Save</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Studio() {
  const s = useAppState();
  const me = getChannel(s, ME_ID)!;
  const vids = allVideos(s).filter((v) => v.channelId === ME_ID).sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  const [editing, setEditing] = useState<Video | null>(null);
  const totalViews = vids.reduce((a, v) => a + v.views, 0);
  const watchHours = Math.round(vids.reduce((a, v) => a + v.views * v.duration * 0.42, 0) / 3600);
  const vSeries = series("views", totalViews / 400);
  const views28 = vSeries.reduce((a, b) => a + b, 0);

  const setVis = (v: Video, visibility: Visibility) =>
    setState((st) =>
      st.uploads.some((u) => u.id === v.id)
        ? { uploads: st.uploads.map((u) => (u.id === v.id ? { ...u, visibility } : u)) }
        : { edits: { ...st.edits, [v.id]: { ...st.edits[v.id], visibility } } },
    );
  const del = (v: Video) => {
    if (!confirm(`Delete "${v.title}" permanently?`)) return;
    setState((st) => ({ uploads: st.uploads.filter((u) => u.id !== v.id), deleted: [...st.deleted, v.id] }));
    toast("Video deleted");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-12">
      <StudioNav />
      {editing && <EditDialog v={editing} onClose={() => setEditing(null)} />}
      <div className="mb-8 flex items-center gap-4">
        <img src={me.avatar} alt="" className="h-14 w-14 rounded-full object-cover" />
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">Channel dashboard</h1>
          <p className="text-sm text-muted-foreground">{me.name} · @{me.handle}</p>
        </div>
        <Link to="/studio/upload" className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Upload className="h-4 w-4" /> Upload</Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat icon={<Eye className="h-4 w-4" />} label="Views" value={compact(views28)} data={vSeries} />
        <Stat icon={<Clock className="h-4 w-4" />} label="Watch time (hours)" value={compact(watchHours)} data={series("wt", watchHours / 28)} />
        <Stat icon={<Users className="h-4 w-4" />} label="Subscribers" value={compact(me.subscribers)} data={series("subs", 40)} />
      </div>

      <h2 className="mb-3 mt-10 font-display text-xl font-semibold">Channel content</h2>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Video</th><th className="p-3">Visibility</th><th className="p-3">Date</th><th className="p-3 text-right">Views</th><th className="p-3 text-right">Likes</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {vids.map((v) => (
              <tr key={v.id} className="border-t border-border">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <Link to="/watch/$id" params={{ id: v.id }} className="relative w-28 shrink-0">
                      <img src={v.thumbnail} alt="" className="aspect-video w-full rounded-md object-cover" />
                      <span className="absolute bottom-1 right-1 rounded bg-overlay/80 px-1 text-[10px] text-overlay-foreground">{duration(v.duration)}</span>
                    </Link>
                    <div className="min-w-0">
                      <p className="line-clamp-1 font-medium">{v.title}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{v.isShort ? "Short · " : ""}{v.category}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <select aria-label="Visibility" value={v.visibility} onChange={(e) => setVis(v, e.target.value as Visibility)} className="rounded-md border border-input bg-background px-2 py-1">
                    <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option>
                  </select>
                </td>
                <td className="p-3 text-muted-foreground">{new Date(v.publishedAt).toLocaleDateString()}</td>
                <td className="p-3 text-right">{v.views.toLocaleString()}</td>
                <td className="p-3 text-right">{v.likes.toLocaleString()}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <button aria-label="Edit" onClick={() => setEditing(v)} className="rounded-full p-2 hover:bg-accent"><Pencil className="h-4 w-4" /></button>
                    <button aria-label="Delete" onClick={() => del(v)} className="rounded-full p-2 text-destructive hover:bg-accent"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {vids.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No videos yet. Upload your first one!</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
