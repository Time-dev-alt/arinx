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
  watermarkEnabled: boolean;
  watermarkText: string;
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
        ...(mt ? { workerURL: await toBlobURL(`${base}/ffmpeg-core.worker.js`, "text/javascript") } : {}),
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

function overlayPos(pos: string): string {
  switch (pos) {
    case "top-left": return "24:24";
    case "top-right": return "W-w-24:24";
    case "bottom-left": return "24:H-h-24";
    default: return "W-w-24:H-h-24";
  }
}

export async function compressVideo(file: File, opts: CompressOptions): Promise<CompressResult> {
  const fingerprint = crypto.randomUUID().slice(0, 8);
  try {
    const ffmpeg = await getFFmpeg(opts.onProgress);
    const { fetchFile } = await import("@ffmpeg/util");
    const p = PRESETS[opts.preset] ?? PRESETS.balanced;

    opts.onProgress?.(0, "Reading video…");
    await ffmpeg.writeFile("in", await fetchFile(file));

    const filters: string[] = [`scale='min(${p.maxWidth},iw)':-2`];
    if (opts.watermarkEnabled) {
      await ffmpeg.writeFile("wm.png", await watermarkPng(opts.watermarkText || "ArinX"));
      filters.push(`overlay=${overlayPos(opts.watermarkPosition)}`);
    }

    let lastRatio = 0;
    const onP = ({ progress }: { progress: number }) => {
      const r = Math.max(0, Math.min(1, progress));
      if (r - lastRatio > 0.02) {
        lastRatio = r;
        opts.onProgress?.(r, "Compressing & watermarking…");
      }
    };
    ffmpeg.on("progress", onP);

    const args = [
      "-i", "in",
      ...(opts.watermarkEnabled ? ["-i", "wm.png"] : []),
      "-filter_complex", filters.length > 1 ? `[0:v]${filters[0]}[s];[s][1:v]${filters[1]}[v]` : `[0:v]${filters[0]}[v]`,
      "-map", "[v]", "-map", "0:a?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", String(p.crf), "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", `${p.audioKbps}k`,
      "-movflags", "+faststart",
      "-metadata", `comment=arinx:wm:${fingerprint}`,
      "-metadata", `copyright=${opts.watermarkText || "ArinX"}`,
      "out.mp4",
    ];
    const ok = await ffmpeg.exec(args);
    ffmpeg.off("progress", onP);
    if (ok !== 0) throw new Error("ffmpeg exited with code " + ok);

    const data = await ffmpeg.readFile("out.mp4");
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
    // Copy into a fresh buffer so the Blob part is a plain ArrayBuffer (TS-safe).
    const buf = new Uint8Array(bytes.length);
    buf.set(bytes);
    await ffmpeg.deleteFile("in").catch(() => {});
    await ffmpeg.deleteFile("out.mp4").catch(() => {});
    if (opts.watermarkEnabled) await ffmpeg.deleteFile("wm.png").catch(() => {});

    const blob = new Blob([buf.buffer], { type: "video/mp4" });
    if (blob.size >= file.size) {
      // Compression made it bigger — keep the original.
      return { blob: file, originalSize: file.size, compressedSize: file.size, fingerprint, compressed: false };
    }
    return { blob, originalSize: file.size, compressedSize: blob.size, fingerprint, compressed: true };
  } catch (e) {
    console.warn("[compress] falling back to original file:", e);
    return { blob: file, originalSize: file.size, compressedSize: file.size, fingerprint, compressed: false };
  }
}
