/**
 * Pure planning layer for the browser encoder. Keeping every decision here (no
 * DOM, no WASM, no network) makes the fastest-path logic unit-testable and
 * keeps `compress.ts` focused on I/O.
 */

export type CompressPreset = "ultra" | "balanced" | "quality";

export interface PresetSpec {
  maxWidth: number;
  crf: number;
  audioKbps: number;
  /** libx264 speed preset. `ultra` is the fastest possible encode. */
  x264: "ultrafast" | "veryfast" | "fast";
}

export const PRESETS: Record<CompressPreset, PresetSpec> = {
  ultra: { maxWidth: 1280, crf: 30, audioKbps: 96, x264: "ultrafast" },
  balanced: { maxWidth: 1920, crf: 26, audioKbps: 128, x264: "veryfast" },
  quality: { maxWidth: 1920, crf: 22, audioKbps: 160, x264: "fast" },
};

export const MAX_INPUT_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB browser-memory guard
export const MAX_ENCODE_MS = 15 * 60 * 1000;
export const CORE_VERSION = "0.12.6";

/** SHA-256 of the exact npm tarball bytes, verified before any WASM executes. */
export const CORE_HASHES: Record<"st" | "mt", Record<string, string>> = {
  st: {
    "ffmpeg-core.js": "c972f5abeafcd5f3949e54edfbdc74a9badb27025809feb1945d468ffbcfb7f1",
    "ffmpeg-core.wasm": "2390efa7fb66e7e42dbae15427571a5ffc96b829480904c30f471f0a78967f61",
  },
  mt: {
    "ffmpeg-core.js": "57b96c0f87548fbe6b43d50618cd18206ccd98dfa97c0caa3eaf8af53ab68af0",
    "ffmpeg-core.wasm": "6a6863fa9f08ee79c47363547421e12a90624b9bbbd8c10ebf7d5967cab14649",
    "ffmpeg-core.worker.js": "dcf69439966525662b52d638253615af23d09677ad135e674d1a9989169ded89",
  },
};

const MIRRORS = [
  "https://cdn.jsdelivr.net/npm",
  "https://fastly.jsdelivr.net/npm",
  "https://unpkg.com",
];

/** Ordered, integrity-pinned CDN candidates for one core file. */
export function coreAssetUrls(kind: "st" | "mt", filename: string): string[] {
  const pkg = kind === "mt" ? "@ffmpeg/core-mt" : "@ffmpeg/core";
  return MIRRORS.map((mirror) => `${mirror}/${pkg}@${CORE_VERSION}/dist/esm/${filename}`);
}

export interface MediaProbe {
  width: number;
  height: number;
  duration: number;
  videoCodec: string | null;
  audioCodec: string | null;
  /** Lowercased container name, e.g. "mp4", "matroska". */
  container: string | null;
}

export interface EncodeNames {
  input: string;
  watermark: string;
  invisible: string;
  output: string;
}

export interface EncodePlanInput {
  preset: CompressPreset;
  probe: MediaProbe | null;
  names: EncodeNames;
  position: string;
  multithreaded: boolean;
  fingerprint: string;
  ownerTag: string;
  watermarkText: string;
}

export interface EncodePlan {
  outWidth: number | null;
  outHeight: number | null;
  needsScale: boolean;
  copyAudio: boolean;
  threads: number;
  filterGraph: string;
  args: string[];
  spec: PresetSpec;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Allowlisted overlay coordinates — no user text ever enters the filter graph. */
export function overlayPos(position: string): string {
  switch (position) {
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

/** Metadata values must not contain control characters or grow unbounded. */
export function sanitizeWatermarkText(value: string | null | undefined, max = 120): string {
  let out = "";
  for (const char of (value ?? "").slice(0, max * 4)) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) continue;
    out += char;
  }
  return out.trim().replace(/\s+/g, " ").slice(0, max);
}

/** Constant-time comparison of two lowercase hex digests. */
export function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length || !/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Progress-based ETA in whole seconds; returns null until meaningful. */
export function estimateEtaSeconds(elapsedMs: number, ratio: number): number | null {
  if (ratio < 0.05 || elapsedMs < 1000) return null;
  const estimate = (elapsedMs / ratio - elapsedMs) / 1000;
  return Number.isFinite(estimate) ? Math.max(0, Math.round(estimate)) : null;
}

/**
 * Builds the single-pass filter graph and ffmpeg arguments.
 *
 * Speed wins vs. the previous implementation:
 *  - the invisible layer is rendered at the exact output size, so `scale2ref`
 *    (a full-frame rescale on every frame) is gone;
 *  - the visible watermark arrives pre-scaled with alpha already baked in, so
 *    `format=rgba` + `colorchannelmixer` are gone;
 *  - a `scale` filter is only inserted when the source really exceeds the cap;
 *  - AAC audio is stream-copied when the container already supports it;
 *  - source metadata (GPS, device ids, etc.) is stripped before publishing.
 */
export function planEncoding(input: EncodePlanInput): EncodePlan {
  const spec = PRESETS[input.preset] ?? PRESETS.balanced;
  const probe = input.probe;
  const hasDimensions = !!probe && probe.width > 0 && probe.height > 0;

  let outWidth: number | null = null;
  let outHeight: number | null = null;
  if (hasDimensions) {
    const factor = Math.min(1, spec.maxWidth / probe!.width);
    outWidth = even(probe!.width * factor);
    outHeight = even(probe!.height * factor);
  }
  const needsScale = !hasDimensions || outWidth !== probe!.width || outHeight !== probe!.height;

  const main = needsScale ? "[base]" : "[0:v]";
  const graphParts: string[] = [];
  if (needsScale) {
    const scaleExpr = hasDimensions ? `${outWidth}:${outHeight}` : `'min(${spec.maxWidth},iw)':-2`;
    graphParts.push(`[0:v]scale=${scaleExpr},setsar=1[base]`);
  }
  // eof_action=repeat keeps the single-frame PNG alive for the whole stream;
  // eval=init resolves W/H expressions once instead of on every frame.
  graphParts.push(`${main}[2:v]overlay=0:0:format=auto:eof_action=repeat[tagged]`);
  graphParts.push(
    `[tagged][1:v]overlay=${overlayPos(input.position)}:format=auto:eval=init:eof_action=repeat,format=yuv420p[v]`,
  );

  // Only remux-already-AAC audio from an MP4-family source. Copying any other
  // codec into MP4 would produce a broken file.
  const mp4Family =
    probe?.container === "mp4" || probe?.container === "mov" || probe?.container === "isobmff";
  const copyAudio = !!probe && probe.audioCodec === "aac" && !!mp4Family;
  const threads = input.multithreaded ? 0 : 1;
  const owner = sanitizeWatermarkText(input.ownerTag) || "ArinX";
  const mark = sanitizeWatermarkText(input.watermarkText) || "ArinX";
  const fingerprint = sanitizeWatermarkText(input.fingerprint, 32);

  const args: string[] = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input.names.input,
    "-i",
    input.names.watermark,
    "-i",
    input.names.invisible,
    "-filter_complex",
    graphParts.join(";"),
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    spec.x264,
    "-crf",
    String(spec.crf),
    "-pix_fmt",
    "yuv420p",
    "-threads",
    String(threads),
    ...(copyAudio ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", `${spec.audioKbps}k`]),
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-sn",
    "-dn",
    "-metadata",
    `comment=arinx:wm:${fingerprint}`,
    "-metadata",
    `copyright=${owner} via ArinX`,
    "-metadata",
    `description=${mark} · ArinX fingerprint ${fingerprint}`,
    input.names.output,
  ];

  return {
    outWidth,
    outHeight,
    needsScale,
    copyAudio,
    threads,
    filterGraph: graphParts.join(";"),
    args,
    spec,
  };
}
