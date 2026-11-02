import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { StudioNav, readAsDataURL } from "@/components/StudioNav";
import { Avatar, SignInPrompt } from "@/components/common";
import { supabase } from "@/integrations/supabase/client";
import { dataUrlToBlob, uploadFile, useAuth, useMe } from "@/lib/api";
import { pageHead } from "@/lib/format";
import { CHANNEL_LINKS, safeExternalUrl } from "@/lib/watch-tools";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/studio/customize")({
  head: () => pageHead("Customize channel", "Edit your ArinX channel name, handle, picture, banner and bio."),
  component: Customize,
});

type Form = { name: string; handle: string; bio: string; location: string; avatar: string | null; banner: string | null; website_url: string; instagram_url: string; x_url: string; discord_url: string };

function Customize() {
  const { uid, ready } = useAuth();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [f, setF] = useState<Form | null>(null);
  const [newImg, setNewImg] = useState<{ avatar?: string; banner?: string }>({});
  const [busy, setBusy] = useState(false);
  const [wm, setWm] = useState<{ mode: "text" | "image"; text: string; path: string | null; file: File | null; preview: string | null }>({ mode: "text", text: "", path: null, file: null, preview: null });
  useEffect(() => {
    if (!uid) return;
    void supabase.from("profiles").select("watermark_mode, watermark_text, watermark_image_path").eq("id", uid).maybeSingle().then(async ({ data }) => {
      if (!data) return;
      let preview: string | null = null;
      if (data.watermark_image_path) preview = (await supabase.storage.from("channel-art").createSignedUrl(data.watermark_image_path, 3600)).data?.signedUrl ?? null;
      setWm({ mode: data.watermark_mode === "image" ? "image" : "text", text: data.watermark_text ?? "", path: data.watermark_image_path, file: null, preview });
    });
  }, [uid]);
  useEffect(() => {
    if (me && !f) setF({ name: me.name, handle: me.handle, bio: me.bio, location: me.location, avatar: me.avatar, banner: me.banner,
      ...Object.fromEntries(CHANNEL_LINKS.map(([key, label]) => [key, me.links.find(link => link.label === label)?.url ?? ""])) as Pick<Form, "website_url" | "instagram_url" | "x_url" | "discord_url"> });
  }, [me, f]);
  if (ready && !uid) return <SignInPrompt title="Customize your channel" text="Sign in to edit your channel." />;
  if (!me || !f) return <div className="p-6"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  const field = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const publish = async () => {
    const handle = f.handle.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!f.name.trim() || !handle) return toast.error("Name and handle are required");
    for (const [key, label] of CHANNEL_LINKS) if (f[key].trim() && !safeExternalUrl(f[key])) return toast.error(`${label} must be a valid http or https link`);
    setBusy(true);
    try {
      if (handle !== me.handle) {
        const { data } = await supabase.from("profiles").select("id").eq("handle", handle).neq("id", me.id).maybeSingle();
        if (data) { toast.error("That handle is taken"); return; }
      }
      const patch = { name: f.name.trim(), handle, bio: f.bio, location: f.location,
        website_url: safeExternalUrl(f.website_url), instagram_url: safeExternalUrl(f.instagram_url), x_url: safeExternalUrl(f.x_url), discord_url: safeExternalUrl(f.discord_url),
        watermark_mode: wm.mode, watermark_text: wm.text.trim().slice(0, 40) || null,
        ...{} as { avatar_url?: string; banner_url?: string; watermark_image_path?: string } };
      if (wm.mode === "image" && !wm.file && !wm.path) { toast.error("Choose a watermark image or switch to text"); return; }
      if (wm.file) {
        patch.watermark_image_path = await uploadFile("channel-art", me.id, wm.file, wm.file.type === "image/png" ? "png" : "jpg");
        setWm((w) => ({ ...w, path: patch.watermark_image_path!, file: null }));
      }
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
          <Button disabled={busy} onClick={publish}>{busy ? "Saving…" : "Publish"}</Button>
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
        <section className="space-y-4 md:col-span-2"><h2 className="font-semibold">Video watermark</h2>
          <p className="text-sm text-muted-foreground">Burned into every video you upload, along with an invisible fingerprint. It can't be turned off — it protects your work when videos are downloaded.</p>
          <div className="flex gap-2">
            {(["text", "image"] as const).map((m) => (
              <Button key={m} type="button" variant={wm.mode === m ? "default" : "secondary"} onClick={() => setWm({ ...wm, mode: m })}>{m === "text" ? "Text" : "Image / logo"}</Button>
            ))}
          </div>
          {wm.mode === "text" ? (
            <label className="block text-sm font-medium">Watermark text<input className={field} maxLength={40} placeholder={`@${me.handle}`} value={wm.text} onChange={(e) => setWm({ ...wm, text: e.target.value })} /></label>
          ) : (
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-36 place-items-center rounded-lg bg-overlay p-2">{wm.preview ? <img src={wm.preview} alt="Watermark preview" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-overlay-foreground/60">No image</span>}</div>
              <label className="cursor-pointer text-sm font-medium text-primary">Choose image (PNG with transparency works best)
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const fl = e.target.files?.[0]; if (!fl) return; if (fl.size > 2_000_000) return toast.error("Image must be under 2 MB"); setWm({ ...wm, file: fl, preview: URL.createObjectURL(fl) }); }} />
              </label>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Applies to new uploads. Leave text empty to use your handle.</p>
        </section>
        <section className="space-y-4"><h2 className="font-semibold">Channel links</h2>
          {CHANNEL_LINKS.map(([key, label]) => <label key={key} className="block text-sm font-medium">{label}<input type="url" className={field} placeholder="https://…" value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })} /></label>)}
        </section>
      </div>
    </div>
  );
}
