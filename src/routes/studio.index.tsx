import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Eye, Clock, Users, Pencil, Trash2, Upload, ShieldCheck, Download } from "lucide-react";
import { toast } from "sonner";
import { StudioNav } from "@/components/StudioNav";
import { Avatar, SignInPrompt } from "@/components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, channelQuery, useAuth, useMe, type Video, type Visibility } from "@/lib/api";
import { compact, duration, pageHead } from "@/lib/format";

import { Button } from "@/components/ui/button";
import { monetizationProgress } from "@/lib/growth";

export const Route = createFileRoute("/studio/")({
  head: () => pageHead("Studio", "Manage your videos and see channel analytics in ArinX Studio."),
  component: Studio,
});

function Stat({ icon, label, value, data, note }: { icon: ReactNode; label: string; value: string; data: number[]; note: string }) {
  const d = data.length > 1 ? data : [0, ...data, ...(data.length ? [] : [0])];
  const max = Math.max(1, ...d);
  const pts = d.map((x, i) => `${(i / (d.length - 1)) * 100},${40 - (x / max) * 36}`).join(" ");
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">{icon} {label}</p>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-3 h-16 w-full text-primary">
        <polyline points={`0,40 ${pts} 100,40`} className="fill-primary/15" />
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

const cumulative = (xs: number[]) => { let t = 0; return xs.map((x) => (t += x)); };

function EditDialog({ v, onClose, onSaved }: { v: Video; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: v.title, description: v.description, category: v.category, visibility: v.visibility, tags: v.tags.join(", ") });
  const save = async () => {
    if (!f.title.trim()) return toast.error("Title is required");
    const { error } = await supabase.from("videos").update({
      title: f.title.trim(), description: f.description, category: f.category, visibility: f.visibility,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
    }).eq("id", v.id);
    if (error) return toast.error(error.message);
    toast("Changes saved");
    onSaved();
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
  const { uid, ready } = useAuth();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data } = useQuery({ ...channelQuery(me?.handle ?? ""), enabled: !!me });
  const { data: eligibility, error: eligibilityError } = useQuery({ queryKey: ["creator-monetization", uid], enabled: !!uid, queryFn: async () => { const { data, error } = await supabase.rpc("creator_monetization_status"); if (error) throw error; return data[0] ?? null; } });
  const [editing, setEditing] = useState<Video | null>(null);
  if (ready && !uid) return <SignInPrompt title="ArinX Studio" text="Sign in to upload and manage your videos." />;
  if (!me) return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  const progress = monetizationProgress(eligibility?.subscribers ?? me.subscribers);
  const vids = data?.videos ?? [];
  const chrono = [...vids].reverse();
  const totalViews = vids.reduce((a, v) => a + v.views, 0);
  const watchHours = Math.round(vids.reduce((a, v) => a + v.views * v.duration * 0.5, 0) / 3600);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["channel"] }), qc.invalidateQueries({ queryKey: ["videos"] }), qc.invalidateQueries({ queryKey: ["video"] })]);

  const setVis = async (v: Video, visibility: Visibility) => {
    const { error } = await supabase.from("videos").update({ visibility }).eq("id", v.id);
    if (error) return toast.error(error.message);
    toast(`Visibility set to ${visibility}`);
    refresh();
  };
  const del = async (v: Video) => {
    if (!confirm(`Delete "${v.title}" permanently?`)) return;
    const { error } = await supabase.from("videos").delete().eq("id", v.id);
    if (error) return toast.error(error.message);
    await supabase.storage.from("videos").remove([v.videoPath]);
    if (v.thumbnailPath && !v.thumbnailPath.startsWith("http")) await supabase.storage.from("thumbnails").remove([v.thumbnailPath]);
    toast("Video deleted");
    refresh();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-12">
      <StudioNav />
      {editing && <EditDialog v={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      <div className="mb-8 flex items-center gap-4">
        <Avatar ch={me} className="h-14 w-14 text-xl" />
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">Channel dashboard</h1>
          <p className="text-sm text-muted-foreground">{me.name} · @{me.handle}</p>
        </div>
        <Link to="/studio/upload" className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Upload className="h-4 w-4" /> Upload</Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat icon={<Eye className="h-4 w-4" />} label="Total views" value={compact(totalViews)} data={cumulative(chrono.map((v) => v.views))} note="Across your uploads, oldest to newest" />
        <Stat icon={<Clock className="h-4 w-4" />} label="Watch time (est. hours)" value={compact(watchHours)} data={cumulative(chrono.map((v) => v.views * v.duration * 0.5 / 3600))} note="Estimated from views and length" />
        <Stat icon={<Users className="h-4 w-4" />} label="Subscribers" value={compact(me.subscribers)} data={chrono.map((v) => v.likes)} note={`${vids.reduce((a, v) => a + v.likes, 0).toLocaleString()} total likes`} />
      </div>

      <section className="mt-8 border-y border-border py-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">Creator monetization</h2><span className="text-sm font-medium text-primary">{eligibilityError ? "Status unavailable" : eligibility?.eligible ? "Subscriber requirement met" : "Building toward eligibility"}</span></div>
        <p className="mt-3 text-sm">{(eligibility?.subscribers ?? me.subscribers).toLocaleString()} / 1,000 subscribers</p>
        <progress className="mt-2 h-2 w-full accent-primary" value={progress.percent} max={100} aria-label="Monetization subscriber progress" />
        <p className="mt-2 text-sm text-muted-foreground">{progress.remaining ? `${progress.remaining.toLocaleString()} subscribers to go. ` : ""}Ads may appear on all channels. Creator payouts are not connected yet.</p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-primary" /><span>Upload fingerprints</span><Button variant="outline" size="sm" onClick={() => { const receipt = { channel: me.handle, exportedAt: new Date().toISOString(), videos: vids.map(v => ({ id: v.id, title: v.title, uploadedAt: v.publishedAt, fingerprint: v.fingerprint ?? null })) }; const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `${me.handle}-upload-records.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download className="h-4 w-4" />Export records</Button></div>
      </section>
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
                      {v.thumbnail ? <img src={v.thumbnail} alt="" className="aspect-video w-full rounded-md object-cover" /> : <div className="aspect-video w-full rounded-md bg-muted" />}
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
