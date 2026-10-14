import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { StudioNav, readAsDataURL } from "@/components/StudioNav";
import { Avatar, SignInPrompt } from "@/components/common";
import { supabase } from "@/integrations/supabase/client";
import { dataUrlToBlob, uploadFile, useAuth, useMe } from "@/lib/api";
import { pageHead } from "@/lib/format";

export const Route = createFileRoute("/studio/customize")({
  head: () => pageHead("Customize channel", "Edit your ArinX channel name, handle, picture, banner and bio."),
  component: Customize,
});

type Form = { name: string; handle: string; bio: string; location: string; avatar: string | null; banner: string | null };

function Customize() {
  const { uid, ready } = useAuth();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [f, setF] = useState<Form | null>(null);
  const [newImg, setNewImg] = useState<{ avatar?: string; banner?: string }>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me && !f) setF({ name: me.name, handle: me.handle, bio: me.bio, location: me.location, avatar: me.avatar, banner: me.banner });
  }, [me, f]);
  if (ready && !uid) return <SignInPrompt title="Customize your channel" text="Sign in to edit your channel." />;
  if (!me || !f) return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  const field = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const publish = async () => {
    const handle = f.handle.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!f.name.trim() || !handle) return toast.error("Name and handle are required");
    setBusy(true);
    try {
      if (handle !== me.handle) {
        const { data } = await supabase.from("profiles").select("id").eq("handle", handle).neq("id", me.id).maybeSingle();
        if (data) { toast.error("That handle is taken"); return; }
      }
      const patch: { name: string; handle: string; bio: string; location: string; avatar_url?: string; banner_url?: string } = { name: f.name.trim(), handle, bio: f.bio, location: f.location };
      if (newImg.avatar) patch.avatar_url = await uploadFile("channel-art", me.id, await dataUrlToBlob(newImg.avatar), "jpg");
      if (newImg.banner) patch.banner_url = await uploadFile("channel-art", me.id, await dataUrlToBlob(newImg.banner), "jpg");
      const { error } = await supabase.from("profiles").update(patch).eq("id", me.id);
      if (error) throw error;
      setNewImg({});
      setF({ ...f, handle });
      await Promise.all([qc.invalidateQueries({ queryKey: ["profile"] }), qc.invalidateQueries({ queryKey: ["channel"] }), qc.invalidateQueries({ queryKey: ["videos"] })]);
      toast.success("Channel updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save changes");
    } finally {
      setBusy(false);
    }
  };

  const imgPick = (key: "avatar" | "banner", w: number) => async (e: ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files?.[0];
    if (!fl) return;
    const d = await readAsDataURL(fl, w);
    setNewImg((x) => ({ ...x, [key]: d }));
    setF((x) => (x ? { ...x, [key]: d } : x));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-12">
      <StudioNav />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Channel customization</h1>
        <div className="flex gap-2">
          <Link to="/channel/$handle" params={{ handle: me.handle }} className="rounded-full px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10">View channel</Link>
          <button disabled={busy} onClick={publish} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Publish"}</button>
        </div>
      </div>
      <div className="space-y-8">
        <section>
          <h2 className="font-semibold">Banner image</h2>
          <p className="text-sm text-muted-foreground">Appears across the top of your channel.</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            {f.banner ? <img src={f.banner} alt="" className="aspect-[6/1] w-full max-w-md rounded-lg object-cover" /> : <div className="aspect-[6/1] w-full max-w-md rounded-lg bg-muted" />}
            <label className="cursor-pointer rounded-full bg-muted px-4 py-2 text-sm font-medium hover:bg-accent">Change<input type="file" accept="image/*" className="hidden" onChange={imgPick("banner", 2048)} /></label>
          </div>
        </section>
        <section>
          <h2 className="font-semibold">Picture</h2>
          <p className="text-sm text-muted-foreground">Shown next to your videos and comments.</p>
          <div className="mt-3 flex items-center gap-4">
            <Avatar ch={{ name: f.name, avatar: f.avatar }} className="h-24 w-24 text-4xl" />
            <label className="cursor-pointer rounded-full bg-muted px-4 py-2 text-sm font-medium hover:bg-accent">Change<input type="file" accept="image/*" className="hidden" onChange={imgPick("avatar", 400)} /></label>
          </div>
        </section>
        <section className="space-y-4">
          <label className="block text-sm font-medium">Name<input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="block text-sm font-medium">Handle
            <div className="mt-1 flex items-center rounded-lg border border-input bg-background px-3 focus-within:border-primary">
              <span className="text-sm text-muted-foreground">@</span>
              <input className="w-full bg-transparent py-2 text-sm outline-none" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} />
            </div>
          </label>
          <label className="block text-sm font-medium">Location<input className={field} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
          <label className="block text-sm font-medium">Description<textarea rows={5} className={field} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></label>
        </section>
      </div>
    </div>
  );
}
