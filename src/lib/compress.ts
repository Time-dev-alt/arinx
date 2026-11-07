/**
 * In-browser video compression + watermarking powered by ffmpeg.wasm (WebAssembly).
 * Loaded lazily on first use so it never ships in the initial bundle or runs during SSR.
 *
 * What it does to every upload (when enabled in the admin panel):
 *  - Re-encodes to H.264 MP4 at the chosen preset (resolution cap + CRF), AAC 128k audio.
 *  - Bakes a VISIBLE watermark (rendered to a PNG on a canvas, then overlaid) into every frame.
 *  - Bakes an INVISIBLE fingerprint: a unique ID written into the file metadata and into a
 *    near-invisible pixel tag in a corner, so re-uploads/screenshots can be traced.
 */

export type CompressPreset = "ultra" | "balanced" | "quality";

export interface CompressOptions {
  preset: CompressPreset;
  /** Optional channel image watermark (PNG/JPG). When set, it is used instead of the text. */
  watermarkImage?: Blob | null;
  watermarkText: string;
  /** Traceable owner tag (e.g. channel handle) baked into the invisible layer and metadata. */
  ownerTag?: string;
  watermarkPosition: string; // "top-left" | "top-right" | "bottom-left" | "bottom-right"
  onProgress?: (ratio: number, stage: string) => void;
}

export interface CompressResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  fingerprint: string;
  compressed: boolean; // false if we fell back to the original file
}

const PRESETS: Record<CompressPreset, { maxWidth: number; crf: number; audioKbps: number }> = {
  ultra: { maxWidth: 1280, crf: 30, audioKbps: 96 },
  balanced: { maxWidth: 1920, crf: 26, audioKbps: 128 },
  quality: { maxWidth: 1920, crf: 22, audioKbps: 160 },
};

let ffmpegPromise: Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null = null;

async function getFFmpeg(onProgress?: (ratio: number, stage: string) => void) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      const mt = typeof SharedArrayBuffer !== "undefined";
      const base = mt
        ? "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm"
        : "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
      onProgress?.(0, "Loading compressor…");
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
        ...(mt
          ? { workerURL: await toBlobURL(`${base}/ffmpeg-core.worker.js`, "text/javascript") }
          : {}),
      });
      return ffmpeg;
    })();
  }
  return ffmpegPromise;
}

/** Renders the visible watermark text to a transparent PNG. */
async function watermarkPng(text: string): Promise<Uint8Array> {
  const c = document.createElement("canvas");
  const pad = 14;
  const font = "600 28px sans-serif";
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width);
  c.width = w + pad * 2;
  c.height = 44;
  const ctx2 = c.getContext("2d")!;
  ctx2.font = font;
  ctx2.textBaseline = "middle";
  ctx2.fillStyle = "rgba(255,255,255,0.55)";
  ctx2.shadowColor = "rgba(0,0,0,0.6)";
  ctx2.shadowBlur = 4;
  ctx2.fillText(text, pad, c.height / 2);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Full-frame, near-invisible tiled layer carrying the fingerprint — survives re-encodes and crops. */
async function invisiblePng(tag: string): Promise<Uint8Array> {
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const ctx = c.getContext("2d")!;
  ctx.font = "600 22px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  ctx.rotate(-0.35);
  for (let y = -200; y < 1100; y += 90)
    for (let x = -400; x < 1600; x += tag.length * 14 + 80) ctx.fillText(tag, x, y);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

function overlayPos(pos: string): string {
  switch (pos) {
    case "top-left":
      return "24:24";
    case "top-right":
      return "W-w-24:24";
    case "bottom-left":
      return "24:H-h-24";
    default:
      return "W-w-24:H-h-24";
  }
}

export async function compressVideo(file: File, opts: CompressOptions): Promise<CompressResult> {
  const fingerprint = crypto.randomUUID().slice(0, 8);
  const tag = `ARINX ${opts.ownerTag ?? ""} ${fingerprint}`.replace(/\s+/g, " ");
  const ffmpeg = await getFFmpeg(opts.onProgress);
  const { fetchFile } = await import("@ffmpeg/util");
  const p = PRESETS[opts.preset] ?? PRESETS.balanced;

  opts.onProgress?.(0, "Reading video…");
  await ffmpeg.writeFile("in", await fetchFile(file));
  const useImage = !!opts.watermarkImage;
  await ffmpeg.writeFile(
    "wm.png",
    useImage
      ? new Uint8Array(await opts.watermarkImage!.arrayBuffer())
      : await watermarkPng(opts.watermarkText || "ArinX"),
  );
  await ffmpeg.writeFile("inv.png", await invisiblePng(tag));

  let lastRatio = 0;
  const onP = ({ progress }: { progress: number }) => {
    const r = Math.max(0, Math.min(1, progress));
    if (r - lastRatio > 0.02) {
      lastRatio = r;
      opts.onProgress?.(r, "Compressing & watermarking…");
    }
  };
  ffmpeg.on("progress", onP);

  // [s] scaled source → invisible tiled layer stretched over it → visible mark in the corner.
  const graph = [
    `[0:v]scale='min(${p.maxWidth},iw)':-2[s]`,
    `[2:v][s]scale2ref[inv][s1]`,
    `[s1][inv]overlay=0:0[a]`,
    useImage
      ? `[1:v]scale='min(200,iw)':-1,format=rgba,colorchannelmixer=aa=0.7[w]`
      : `[1:v]null[w]`,
    `[a][w]overlay=${overlayPos(opts.watermarkPosition)}[v]`,
  ].join(";");
  const args = [
    "-i",
    "in",
    "-i",
    "wm.png",
    "-i",
    "inv.png",
    "-filter_complex",
    graph,
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(p.crf),
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    `${p.audioKbps}k`,
    "-movflags",
    "+faststart",
    "-metadata",
    `comment=arinx:wm:${fingerprint}`,
    "-metadata",
    `copyright=${opts.ownerTag || opts.watermarkText || "ArinX"} via ArinX`,
    "-metadata",
    `description=${tag}`,
    "out.mp4",
  ];
  try {
    const ok = await ffmpeg.exec(args);
    if (ok !== 0) throw new Error("Watermarking failed (code " + ok + ")");
    const data = await ffmpeg.readFile("out.mp4");
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
    const buf = new Uint8Array(bytes.length);
    buf.set(bytes);
    const blob = new Blob([buf.buffer], { type: "video/mp4" });
    // Watermarks are mandatory, so the re-encoded file is always kept.
    return {
      blob,
      originalSize: file.size,
      compressedSize: blob.size,
      fingerprint,
      compressed: true,
    };
  } finally {
    ffmpeg.off("progress", onP);
    for (const f of ["in", "out.mp4", "wm.png", "inv.png"])
      await ffmpeg.deleteFile(f).catch(() => {});
  }
}
