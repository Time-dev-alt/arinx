import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { StudioNav, readAsDataURL } from "@/components/StudioNav";
import { ME_ID } from "@/lib/data";
import { pageHead } from "@/lib/format";
import { getChannel, getChannels, setState, useAppState } from "@/lib/store";

export const Route = createFileRoute("/studio/customize")({
  head: () => pageHead("Customize channel", "Edit your ArinX channel name, handle, picture, banner and bio."),
  component: Customize,
});

function Customize() {
  const s = useAppState();
  const me = getChannel(s, ME_ID)!;
  const [f, setF] = useState({ name: me.name, handle: me.handle, bio: me.bio, avatar: me.avatar, banner: me.banner });
  const field = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const publish = () => {
    const handle = f.handle.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!f.name.trim() || !handle) return toast.error("Name and handle are required");
    if (getChannels(s).some((c) => c.id !== ME_ID && c.handle === handle)) return toast.error("That handle is taken");
    setState(() => ({ me: { ...f, name: f.name.trim(), handle } }));
    setF((x) => ({ ...x, handle }));
    toast.success("Channel updated");
  };

  const imgPick = (key: "avatar" | "banner", w: number) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files?.[0];
    if (fl) setF((x) => ({ ...x, [key]: "" }));
    if (fl) {
      const d = await readAsDataURL(fl, w);
      setF((x) => ({ ...x, [key]: d }));
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-12">
      <StudioNav />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Channel customization</h1>
        <div className="flex gap-2">
          <Link to="/channel/$handle" params={{ handle: me.handle }} className="rounded-full px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10">View channel</Link>
          <button onClick={publish} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Publish</button>
        </div>
      </div>
      <div className="space-y-8">
        <section>
          <h2 className="font-semibold">Banner image</h2>
          <p className="text-sm text-muted-foreground">Appears across the top of your channel.</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            {f.banner && <img src={f.banner} alt="" className="aspect-[6/1] w-full max-w-md rounded-lg object-cover" />}
            <label className="cursor-pointer rounded-full bg-muted px-4 py-2 text-sm font-medium hover:bg-accent">Change<input type="file" accept="image/*" className="hidden" onChange={imgPick("banner", 2048)} /></label>
          </div>
        </section>
        <section>
          <h2 className="font-semibold">Picture</h2>
          <p className="text-sm text-muted-foreground">Shown next to your videos and comments.</p>
          <div className="mt-3 flex items-center gap-4">
            {f.avatar && <img src={f.avatar} alt="" className="h-24 w-24 rounded-full object-cover" />}
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
          <label className="block text-sm font-medium">Description<textarea rows={5} className={field} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></label>
        </section>
      </div>
    </div>
  );
}
