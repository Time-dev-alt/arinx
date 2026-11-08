import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, UploadCloud, Check } from "lucide-react";
import { toast } from "sonner";
import { StudioNav, readAsDataURL } from "@/components/StudioNav";
import { useQueryClient } from "@tanstack/react-query";
import { SignInPrompt } from "@/components/common";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, dataUrlToBlob, uploadFile, useAuth, type Visibility } from "@/lib/api";
import { compressVideo, resetEncoder, type CompressPreset } from "@/lib/compress";
import { probeMedia } from "@/lib/media-probe";
import { MAX_INPUT_BYTES, type MediaProbe } from "@/lib/media-plan";
import { useSiteSettings } from "@/lib/settings";
import { duration as fmt, pageHead } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/studio/upload")({
  head: () => pageHead("Upload video", "Upload a video to your ArinX channel.", { noindex: true }),
  component: UploadPage,
});

/** Waits for a media event with a hard timeout so a corrupt file cannot hang UI. */
function mediaEvent<T extends HTMLElement>(el: T, event: string, ms = 8_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      el.removeEventListener(event, done);
      reject(new Error(`Timed out waiting for ${event}`));
    }, ms);
    const done = () => {
      window.clearTimeout(timer);
      el.removeEventListener(event, done);
      resolve();
    };
    el.addEventListener(event, done, { once: true });
  });
}

async function grabFrames(
  url: string,
): Promise<{ frames: string[]; duration: number; vertical: boolean }> {
  const v = document.createElement("video");
  v.src = url;
  v.muted = true;
  v.preload = "auto";
  try {
    const loaded = mediaEvent(v, "loadeddata");
    v.load();
    await loaded;
    const frames: string[] = [];
    if (!Number.isFinite(v.duration) || v.duration <= 0) throw new Error("Unknown duration");
    for (const p of [0.15, 0.45, 0.75]) {
      const target = Math.min(v.duration - 0.05, Math.max(0, v.duration * p));
      // Seeking to the current time emits no `seeked` event.
      if (Math.abs(v.currentTime - target) >= 0.01) {
        const seeked = mediaEvent(v, "seeked", 6_000);
        v.currentTime = target;
        await seeked;
      }
      const c = document.createElement("canvas");
      const scale = Math.min(1, 640 / Math.max(1, v.videoWidth));
      c.width = Math.max(1, Math.round(v.videoWidth * scale));
      c.height = Math.max(1, Math.round(v.videoHeight * scale));
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      frames.push(c.toDataURL("image/jpeg", 0.8));
    }
    return { frames, duration: v.duration, vertical: v.videoHeight > v.videoWidth };
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}

function UploadPage() {
  const nav = useNavigate();
  const { uid, ready } = useAuth();
  const { data: settings } = useSiteSettings();
  const qc = useQueryClient();
  const [stage, setStage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [frames, setFrames] = useState<string[]>([]);
  const [thumb, setThumb] = useState("");
  const [dur, setDur] = useState(0);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<MediaProbe | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [f, setF] = useState({
    title: "",
    description: "",
    category: "Tech",
    visibility: "public" as Visibility,
    tags: "",
    isShort: false,
  });
  const thumbInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => () => abortRef.current?.abort(), []);

  const pick = async (fl: File | undefined) => {
    if (!fl) return;
    if (!fl.type.startsWith("video/")) return toast.error("Please choose a video file");
    if (fl.size > MAX_INPUT_BYTES)
      return toast.error("Files over 2 GB cannot be processed in the browser");
    if (!fl.size) return toast.error("That file is empty");
    const url = URL.createObjectURL(fl);
    setFile(fl);
    setPreview(url);
    setProbe(null);
    setF((x) => ({ ...x, title: x.title || fl.name.replace(/\.[^.]+$/, "") }));
    // Probe while the creator fills in the form — zero perceived latency.
    void probeMedia(fl)
      .then(setProbe)
      .catch(() => {});
    try {
      const r = await grabFrames(url);
      setFrames(r.frames);
      setThumb(r.frames[0]);
      setDur(r.duration);
      setF((x) => ({ ...x, isShort: r.vertical && r.duration <= 60 }));
    } catch {
      toast("Couldn't read frames — upload a custom thumbnail");
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    resetEncoder();
    setBusy(false);
    setStage("");
    toast.message("Upload cancelled");
  };

  const publish = async () => {
    if (!uid) return;
    if (!file || !f.title.trim()) return toast.error("Add a video and a title");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Watermarks are always applied; compression preset falls back to "quality" when shrinking is off.
      const { data: wm } = await supabase
        .from("profiles")
        .select("handle, watermark_mode, watermark_text, watermark_image_path")
        .eq("id", uid)
        .maybeSingle();
      let watermarkImage: Blob | null = null;
      if (wm?.watermark_mode === "image" && wm.watermark_image_path) {
        const { data: img } = await supabase.storage
          .from("channel-art")
          .download(wm.watermark_image_path);
        watermarkImage = img ?? null;
      }
      const r = await compressVideo(file, {
        preset: (settings?.compression_enabled
          ? settings.compression_preset
          : "quality") as CompressPreset,
        watermarkImage,
        watermarkText:
          wm?.watermark_text?.trim() ||
          (wm?.handle ? `@${wm.handle}` : settings?.watermark_text || "ArinX"),
        ownerTag: wm?.handle ? `@${wm.handle}` : uid.slice(0, 8),
        watermarkPosition: settings?.watermark_position ?? "bottom-right",
        probe,
        signal: controller.signal,
        onProgress: (ratio, stage, eta) =>
          setStage(
            ratio > 0
              ? `${stage} ${Math.round(ratio * 100)}%${eta ? ` · ~${Math.ceil(eta / 60)} min left` : ""}`
              : stage,
          ),
      });
      const toUpload: Blob = r.blob;
      const ext = "mp4";
      const fingerprint = r.fingerprint;
      toast.success(
        `Watermarked in ${(r.elapsedMs / 1000).toFixed(0)}s · ` +
          `${(r.originalSize / 1048576).toFixed(1)} MB → ${(r.compressedSize / 1048576).toFixed(1)} MB` +
          `${r.width ? ` · ${r.width}×${r.height}` : ""}${r.multithreaded ? " · multi-threaded" : ""}`,
      );
      setStage("Uploading video…");
      const videoPath = await uploadFile("videos", uid, toUpload, ext);
      let thumbPath: string | null = null;
      const t = thumb || frames[0];
      if (t) {
        setStage("Uploading thumbnail…");
        thumbPath = await uploadFile("thumbnails", uid, await dataUrlToBlob(t), "jpg");
      }
      setStage("Publishing…");
      const { error } = await supabase.from("videos").insert({
        owner_id: uid,
        title: f.title.trim(),
        description: f.description,
        category: f.category,
        tags: f.tags
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        visibility: f.visibility,
        is_short: f.isShort,
        video_path: videoPath,
        thumbnail_url: thumbPath,
        duration: Math.round(dur),
        watermark_fingerprint: fingerprint,
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["videos"] }),
        qc.invalidateQueries({ queryKey: ["channel"] }),
      ]);
      toast.success("Video published");
      nav({ to: "/studio" });
    } catch (e) {
      if (controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError"))
        return;
      toast.error(`Upload failed: ${e instanceof Error ? e.message : "please try again"}`);
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStage("");
    }
  };

  const field =
    "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  if (ready && !uid)
    return <SignInPrompt title="Upload videos" text="Sign in to upload videos to your channel." />;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-12">
      <StudioNav />
      {!file ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-24 text-center",
            drag && "border-primary bg-primary/5",
          )}
        >
          <span className="grid h-32 w-32 place-items-center rounded-full bg-muted">
            <UploadCloud className="h-14 w-14 text-muted-foreground" />
          </span>
          <p className="mt-6 font-semibold">Drag and drop a video file to upload</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your video stays private until you publish.
          </p>
          <span className="mt-6 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">
            Select file
          </span>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Details</h1>
            <label className="block text-sm font-medium">
              Title (required)
              <input
                className={field}
                maxLength={100}
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              Description
              <textarea
                rows={6}
                className={field}
                placeholder={"Tell viewers about your video\nTip: add chapters like 0:00 Intro"}
                value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
              />
            </label>
            <div>
              <p className="text-sm font-medium">Thumbnail</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <button
                  onClick={() => thumbInput.current?.click()}
                  className="flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-accent"
                >
                  <ImagePlus className="h-5 w-5" /> Upload file
                </button>
                <input
                  ref={thumbInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const fl = e.target.files?.[0];
                    if (fl) {
                      const d = await readAsDataURL(fl, 1280);
                      setFrames((x) => [d, ...x]);
                      setThumb(d);
                    }
                  }}
                />
                {frames.map((fr) => (
                  <button
                    key={fr.slice(-40)}
                    onClick={() => setThumb(fr)}
                    className={cn(
                      "relative aspect-video overflow-hidden rounded-lg ring-2",
                      thumb === fr ? "ring-primary" : "ring-transparent",
                    )}
                  >
                    <img src={fr} alt="" className="h-full w-full object-cover" />
                    {thumb === fr && (
                      <Check className="absolute right-1 top-1 h-4 w-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Category
                <select
                  className={field}
                  value={f.category}
                  onChange={(e) => setF({ ...f, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Tags
                <input
                  className={field}
                  placeholder="comma, separated"
                  value={f.tags}
                  onChange={(e) => setF({ ...f, tags: e.target.value })}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={f.isShort}
                onChange={(e) => setF({ ...f, isShort: e.target.checked })}
              />{" "}
              Publish as a Short
            </label>
            <fieldset>
              <legend className="text-sm font-medium">Visibility</legend>
              <div className="mt-2 space-y-2">
                {(
                  [
                    ["public", "Public", "Everyone can watch your video"],
                    ["unlisted", "Unlisted", "Anyone with the link can watch"],
                    ["private", "Private", "Only you can watch"],
                  ] as const
                ).map(([val, label, hint]) => (
                  <label
                    key={val}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                      f.visibility === val ? "border-primary" : "border-border",
                    )}
                  >
                    <input
                      type="radio"
                      name="vis"
                      className="mt-1 accent-primary"
                      checked={f.visibility === val}
                      onChange={() => setF({ ...f, visibility: val })}
                    />
                    <span>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <aside className="h-fit space-y-4 rounded-2xl bg-card p-4 lg:sticky lg:top-20">
            <video src={preview} controls className="aspect-video w-full rounded-lg bg-overlay" />
            <div className="text-sm">
              <p className="text-muted-foreground">Filename</p>
              <p className="truncate">{file.name}</p>
              <p className="mt-2 text-muted-foreground">Length · Size</p>
              <p>
                {fmt(dur)} · {(file.size / 1048576).toFixed(1)} MB
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  abortRef.current?.abort();
                  resetEncoder();
                  setFile(null);
                  setFrames([]);
                  setThumb("");
                  setProbe(null);
                }}
                className="flex-1 rounded-full bg-muted py-2 text-sm font-medium hover:bg-accent"
              >
                Discard
              </button>
              {busy ? (
                <button
                  onClick={cancel}
                  className="flex-1 rounded-full bg-destructive py-2 text-sm font-medium text-destructive-foreground"
                >
                  {stage || "Working…"} · Cancel
                </button>
              ) : (
                <button
                  onClick={publish}
                  className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground"
                >
                  Publish
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
