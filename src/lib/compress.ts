/**
 * Enterprise-grade browser encoder for uploads.
 *
 * Pipeline: probe → integrity-verified WASM core → pre-rendered watermark
 * layers → single-pass ffmpeg graph → verified MP4 → upload.
 *
 * Hardening / speed properties:
 *  - every ffmpeg core byte is SHA-256 verified against the npm tarball before
 *    execution (no unverified CDN code), with three CDN mirrors;
 *  - multithreaded core is used only on cross-origin-isolated pages, and falls
 *    back to single-thread automatically;
 *  - one shared encoder instance behind a serial queue, with per-job file
 *    names, so concurrent uploads cannot clobber each other;
 *  - full AbortSignal cancellation, hard encode timeout and guaranteed FS
 *    cleanup on success, failure and abort;
 *  - source metadata is stripped, a visible mark and a tiled forensic tag are
 *    baked in, and the fingerprint is returned for server-side registration;
 *  - the filter graph avoids per-frame rescaling and pixel-format conversions.
 */
import {
  CORE_HASHES,
  MAX_ENCODE_MS,
  MAX_INPUT_BYTES,
  constantTimeHexEqual,
  coreAssetUrls,
  estimateEtaSeconds,
  planEncoding,
  sha256Hex,
  type CompressPreset,
  type MediaProbe,
} from "@/lib/media-plan";
import { probeMedia } from "@/lib/media-probe";
import { detectEncoderCapabilities } from "@/lib/encoder-capabilities";
import { computeBenchmark, type EncoderBenchmark } from "@/lib/encoder-benchmark";

export type { CompressPreset, MediaProbe };

export interface CompressOptions {
  preset: CompressPreset;
  watermarkImage?: Blob | null;
  watermarkText: string;
  ownerTag?: string;
  watermarkPosition: string;
  /** Optional precomputed probe (the upload page already opened the file). */
  probe?: MediaProbe | null;
  signal?: AbortSignal;
  onProgress?: (ratio: number, stage: string, etaSeconds?: number | null) => void;
}

export interface CompressResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  fingerprint: string;
  compressed: boolean;
  /** Observability for the creator and for support diagnostics. */
  elapsedMs: number;
  width: number | null;
  height: number | null;
  preset: CompressPreset;
  multithreaded: boolean;
  copiedAudio: boolean;
  coreIntegrityVerified: boolean;
}

type FFmpeg = import("@ffmpeg/ffmpeg").FFmpeg;

interface Encoder {
  ffmpeg: FFmpeg;
  multithreaded: boolean;
  blobUrls: string[];
}

let encoderPromise: Promise<Encoder> | null = null;
let jobQueue: Promise<unknown> = Promise.resolve();
let jobCounter = 0;

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Compression cancelled", "AbortError");
}

async function fetchVerified(
  kind: "st" | "mt",
  filename: string,
  signal?: AbortSignal,
): Promise<{ url: string; bytes: Uint8Array }> {
  const expected = CORE_HASHES[kind][filename];
  if (!expected) throw new Error(`No pinned hash for ${kind}/${filename}`);
  const mime = filename.endsWith(".wasm") ? "application/wasm" : "text/javascript";
  const failures: string[] = [];

  for (const candidate of coreAssetUrls(kind, filename)) {
    try {
      assertNotAborted(signal);
      const response = await fetch(candidate, { signal, cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const actual = await sha256Hex(bytes);
      if (!constantTimeHexEqual(actual, expected)) {
        failures.push(`${new URL(candidate).host}: digest mismatch`);
        continue;
      }
      return { url: URL.createObjectURL(new Blob([bytes], { type: mime })), bytes };
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push(`${new URL(candidate).host}: ${String(error)}`);
    }
  }
  throw new Error(`Could not load a verified ffmpeg core (${filename}): ${failures.join("; ")}`);
}

async function loadEncoder(
  kind: "st" | "mt",
  onProgress?: CompressOptions["onProgress"],
  signal?: AbortSignal,
): Promise<Encoder> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const files =
    kind === "mt"
      ? ["ffmpeg-core.js", "ffmpeg-core.wasm", "ffmpeg-core.worker.js"]
      : ["ffmpeg-core.js", "ffmpeg-core.wasm"];
  onProgress?.(0, "Verifying compressor…");
  const verified = await Promise.all(files.map((f) => fetchVerified(kind, f, signal)));
  const blobUrls = verified.map((v) => v.url);
  const byName = Object.fromEntries(files.map((f, i) => [f, verified[i].url]));

  const ffmpeg = new FFmpeg();
  try {
    await ffmpeg.load(
      {
        coreURL: byName["ffmpeg-core.js"],
        wasmURL: byName["ffmpeg-core.wasm"],
        ...(kind === "mt" ? { workerURL: byName["ffmpeg-core.worker.js"] } : {}),
      },
      { signal },
    );
  } catch (error) {
    for (const url of blobUrls) URL.revokeObjectURL(url);
    throw error;
  }
  return { ffmpeg, multithreaded: kind === "mt", blobUrls };
}

async function getEncoder(
  onProgress?: CompressOptions["onProgress"],
  signal?: AbortSignal,
): Promise<Encoder> {
  if (!encoderPromise) {
    // Device-aware selection: isolation alone is not enough, we also need
    // SharedArrayBuffer and at least two logical cores to beat the ST core.
    const preferred = detectEncoderCapabilities().preferredCore;
    encoderPromise = loadEncoder(preferred, onProgress, signal).catch(async (error) => {
      encoderPromise = null;
      if (preferred === "mt") {
        // Some hosts expose SharedArrayBuffer without a working pthread build.
        onProgress?.(0, "Falling back to single-thread compressor…");
        return loadEncoder("st", onProgress, signal);
      }
      throw error;
    });
  }
  return encoderPromise;
}

export function resetEncoder(): void {
  const pending = encoderPromise;
  encoderPromise = null;
  void pending
    ?.then((encoder) => {
      for (const url of encoder.blobUrls) URL.revokeObjectURL(url);
      try {
        encoder.ffmpeg.terminate();
      } catch {
        /* already gone */
      }
    })
    .catch(() => {});
}

/** A tiny serial lock: one FFmpeg instance is shared by all uploads. */
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = jobQueue.then(task, task);
  jobQueue = run.catch(() => {});
  return run;
}

type CanvasLike = OffscreenCanvas | HTMLCanvasElement;

/** A real type predicate: the `typeof ... && instanceof ...` form does not
 * narrow the negative branch, which left `canvas.toBlob()` untyped. */
function isOffscreenCanvas(canvas: CanvasLike): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas;
}

function createCanvas(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBytes(canvas: CanvasLike): Promise<Uint8Array> {
  let blob: Blob | null;
  if (isOffscreenCanvas(canvas)) {
    blob = await canvas.convertToBlob({ type: "image/png" });
  } else {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  }
  if (!blob) throw new Error("Could not render watermark layer");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Visible text mark, with the final alpha already baked into the PNG. */
async function watermarkPng(text: string): Promise<Uint8Array> {
  const font = "600 28px sans-serif";
  const measure = createCanvas(8, 8).getContext("2d") as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!measure) throw new Error("Canvas 2D unavailable");
  measure.font = font;
  const label = text.slice(0, 80) || "ArinX";
  const width = Math.min(1200, Math.ceil(measure.measureText(label).width) + 28);
  const canvas = createCanvas(width, 44);
  const ctx = canvas.getContext("2d") as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 4;
  ctx.fillText(label, 14, canvas.height / 2);
  return canvasToBytes(canvas);
}

/** Scales a creator image and bakes the opacity in, so ffmpeg needs no filter. */
async function watermarkImagePng(source: Blob): Promise<Uint8Array> {
  const maxW = 200;
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, maxW / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d") as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    ctx.globalAlpha = 0.72;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvasToBytes(canvas);
  } finally {
    bitmap.close();
  }
}

/**
 * Tiled forensic layer rendered at the exact output size. A tiled, low-amplitude
 * tag survives cropping, scaling and most re-encodes far better than a corner
 * pixel mark.
 */
async function invisiblePng(
  tag: string,
  width: number | null,
  height: number | null,
): Promise<Uint8Array> {
  const w = Math.max(320, Math.min(1920, width ?? 1280));
  const h = Math.max(180, Math.min(1080, height ?? 720));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d") as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.font = "600 22px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.028)";
  ctx.rotate(-0.35);
  const stepX = Math.max(160, tag.length * 14 + 80);
  for (let y = -h; y < h * 1.6; y += 90) {
    for (let x = -w; x < w * 1.6; x += stepX) ctx.fillText(tag, x, y);
  }
  return canvasToBytes(canvas);
}

function looksLikeMp4(bytes: Uint8Array): boolean {
  return (
    bytes.length > 1024 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

/**
 * Compresses and watermarks one file. Watermarks are mandatory, so a failed
 * encode never silently falls back to an unwatermarked original.
 */
export function compressVideo(file: File, opts: CompressOptions): Promise<CompressResult> {
  return serialize(() => runCompression(file, opts));
}

async function runCompression(file: File, opts: CompressOptions): Promise<CompressResult> {
  const started = Date.now();
  const { signal, onProgress } = opts;
  assertNotAborted(signal);

  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("File is too large to process in the browser (2 GB limit)");
  }
  if (!file.size) throw new Error("The selected file is empty");

  const job = `j${++jobCounter}_${Date.now().toString(36)}`;
  const names = {
    input: `${job}_in`,
    watermark: `${job}_wm.png`,
    invisible: `${job}_inv.png`,
    output: `${job}_out.mp4`,
  };
  const fingerprint = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const tag = `ARINX ${opts.ownerTag ?? ""} ${fingerprint}`.replace(/\s+/g, " ").slice(0, 120);

  onProgress?.(0, "Inspecting media…");
  const probe = opts.probe === undefined ? await probeMedia(file) : opts.probe;
  const encoder = await getEncoder(onProgress, signal);
  const plan = planEncoding({
    preset: opts.preset,
    probe,
    names,
    position: opts.watermarkPosition,
    multithreaded: encoder.multithreaded,
    fingerprint,
    ownerTag: opts.ownerTag ?? "",
    watermarkText: opts.watermarkText,
  });

  const { fetchFile } = await import("@ffmpeg/util");
  const ffmpeg = encoder.ffmpeg;
  let lastRatio = 0;
  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    const ratio = Math.max(0, Math.min(1, progress));
    if (ratio - lastRatio < 0.015 && ratio < 1) return;
    lastRatio = ratio;
    onProgress?.(
      ratio,
      "Compressing & watermarking…",
      estimateEtaSeconds(Date.now() - started, ratio),
    );
  };

  const written: string[] = [];
  try {
    assertNotAborted(signal);
    onProgress?.(0.01, "Reading video…");
    await ffmpeg.writeFile(names.input, await fetchFile(file));
    written.push(names.input);

    onProgress?.(0.02, "Rendering watermarks…");
    const [visible, invisible] = await Promise.all([
      opts.watermarkImage
        ? watermarkImagePng(opts.watermarkImage)
        : watermarkPng(opts.watermarkText || "ArinX"),
      invisiblePng(tag, plan.outWidth, plan.outHeight),
    ]);
    await Promise.all([
      ffmpeg.writeFile(names.watermark, visible).then(() => written.push(names.watermark)),
      ffmpeg.writeFile(names.invisible, invisible).then(() => written.push(names.invisible)),
    ]);

    assertNotAborted(signal);
    ffmpeg.on("progress", onFfmpegProgress);
    const code = await ffmpeg.exec(plan.args, MAX_ENCODE_MS, { signal });
    if (code !== 0) throw new Error(`Watermarking failed (ffmpeg code ${code})`);
    written.push(names.output);

    const data = await ffmpeg.readFile(names.output);
    const bytes =
      data instanceof Uint8Array ? new Uint8Array(data) : new TextEncoder().encode(String(data));
    if (!looksLikeMp4(bytes)) throw new Error("Encoder produced an invalid MP4 file");
    const blob = new Blob([bytes.slice().buffer], { type: "video/mp4" });

    onProgress?.(1, "Done", 0);
    return {
      blob,
      originalSize: file.size,
      compressedSize: blob.size,
      fingerprint,
      compressed: true,
      elapsedMs: Date.now() - started,
      width: plan.outWidth,
      height: plan.outHeight,
      preset: opts.preset,
      multithreaded: encoder.multithreaded,
      copiedAudio: plan.copyAudio,
      coreIntegrityVerified: true,
    };
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      resetEncoder();
      throw new DOMException("Compression cancelled", "AbortError");
    }
    throw error instanceof Error ? error : new Error("Video processing failed");
  } finally {
    ffmpeg.off("progress", onFfmpegProgress);
    for (const name of new Set([
      ...written,
      names.output,
      names.watermark,
      names.invisible,
      names.input,
    ])) {
      await ffmpeg.deleteFile(name).catch(() => {});
    }
  }
}

/**
 * Real, on-device encoder benchmark.
 *
 * Loads the SHA-256-verified core, renders a 320×180 gradient frame and
 * encodes a short constant-input clip at 24 fps. The result is a measured
 * realtime factor (not a heuristic), so operators can compare devices and
 * confirm that cross-origin isolation actually makes the MT core faster.
 * It never touches upload state and cleans up every MEMFS file it creates.
 */
export async function benchmarkEncoder(
  options: { seconds?: number; signal?: AbortSignal; preset?: CompressPreset } = {},
): Promise<EncoderBenchmark> {
  const { signal, preset = "balanced" } = options;
  const seconds = Math.max(1, Math.min(5, Math.round(options.seconds ?? 2)));
  const sourceFps = 24;
  const frames = seconds * sourceFps;
  const stamp = `bench${Date.now().toString(36)}`;
  const frameName = `${stamp}.png`;
  const outName = `${stamp}.mp4`;

  const coreStart = performance.now();
  const encoder = await getEncoder(undefined, signal);
  const coreLoadMs = performance.now() - coreStart;
  const ffmpeg = encoder.ffmpeg;

  try {
    const canvas = createCanvas(320, 180);
    const ctx = canvas.getContext("2d") as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    if (!ctx) throw new Error("Canvas 2D unavailable for benchmark frame");
    const gradient = ctx.createLinearGradient(0, 0, 320, 180);
    gradient.addColorStop(0, "#1e293b");
    gradient.addColorStop(1, "#0ea5e9");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "600 20px sans-serif";
    ctx.fillText("ArinX encoder benchmark", 20, 96);
    await ffmpeg.writeFile(frameName, await canvasToBytes(canvas));

    const args = [
      "-loop",
      "1",
      "-i",
      frameName,
      "-t",
      String(seconds),
      "-r",
      String(sourceFps),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outName,
    ];
    const encodeStart = performance.now();
    const code = await ffmpeg.exec(args, 120_000, { signal });
    const encodeMs = performance.now() - encodeStart;
    if (code !== 0) throw new Error(`Benchmark encode failed (ffmpeg code ${code})`);
    const data = await ffmpeg.readFile(outName);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    if (!looksLikeMp4(bytes)) throw new Error("Benchmark produced an invalid MP4 file");
    return computeBenchmark({
      coreLoadMs,
      encodeMs,
      frames,
      sourceFps,
      outputBytes: bytes.byteLength,
      multithreaded: encoder.multithreaded,
      preset,
    });
  } finally {
    for (const name of [frameName, outName]) {
      await ffmpeg.deleteFile(name).catch(() => {});
    }
  }
}
