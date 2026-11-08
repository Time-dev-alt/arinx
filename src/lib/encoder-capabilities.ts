/**
 * Runtime capability detection for the browser encoder.
 *
 * The fastest safe path depends on what the *device and page* actually support,
 * not on a build-time flag. This module is deliberately free of side effects
 * and takes an injectable scope so it can be unit tested on a server.
 */
import type { CompressPreset } from "@/lib/media-plan";

export interface EncoderCapabilities {
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  /** Logical cores; clamped to at least 1. */
  threads: number;
  /** `navigator.deviceMemory` in GiB when exposed, otherwise null. */
  deviceMemoryGb: number | null;
  offscreenCanvas: boolean;
  createImageBitmap: boolean;
  webCodecsVideoEncoder: boolean;
  webCodecsVideoFrame: boolean;
  mediaRecorder: boolean;
  /** Both isolation and ≥2 cores are needed for the pthread ffmpeg core. */
  multithreaded: boolean;
  preferredCore: "mt" | "st";
  recommendedPreset: CompressPreset;
  /** Short, human-readable reasons for the current choice. */
  notes: string[];
}

function has(scope: Record<string, unknown>, key: string): boolean {
  return typeof scope[key] !== "undefined";
}

function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function recommendPreset(
  threads: number,
  deviceMemoryGb: number | null,
  multithreaded: boolean,
): CompressPreset {
  // Conservative by default: an over-ambitious preset on a weak device is
  // worse than a slightly larger file. Quality is only offered when there is
  // both headroom and a threaded core.
  if (threads <= 2 || (deviceMemoryGb !== null && deviceMemoryGb <= 2)) return "ultra";
  if (multithreaded && threads >= 8 && (deviceMemoryGb === null || deviceMemoryGb >= 8)) {
    return "quality";
  }
  return "balanced";
}

export function detectEncoderCapabilities(
  scope: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
): EncoderCapabilities {
  const nav = (scope.navigator ?? {}) as Record<string, unknown>;
  const isolated = scope.crossOriginIsolated === true;
  const sharedArrayBuffer = has(scope, "SharedArrayBuffer");
  const threads = numberOr(nav.hardwareConcurrency, 1);
  const memoryValue = Number(nav.deviceMemory);
  const deviceMemoryGb =
    Number.isFinite(memoryValue) && memoryValue > 0 ? Math.round(memoryValue * 10) / 10 : null;
  const webCodecsVideoEncoder =
    has(scope, "VideoEncoder") && typeof scope.VideoEncoder === "function";
  const webCodecsVideoFrame = has(scope, "VideoFrame") && typeof scope.VideoFrame === "function";
  const offscreenCanvas =
    has(scope, "OffscreenCanvas") && typeof scope.OffscreenCanvas === "function";
  const createImageBitmap = typeof scope.createImageBitmap === "function";
  const mediaRecorder = has(scope, "MediaRecorder") && typeof scope.MediaRecorder === "function";
  const multithreaded = isolated && sharedArrayBuffer && threads >= 2;

  const notes: string[] = [];
  if (!isolated) {
    notes.push("Page is not cross-origin isolated; the threaded wasm core is unavailable.");
  } else if (!sharedArrayBuffer) {
    notes.push("SharedArrayBuffer is missing; the threaded wasm core is unavailable.");
  } else if (threads < 2) {
    notes.push("Single logical core; multithreading would be slower.");
  } else {
    notes.push(`Threaded ffmpeg core available with ${threads} logical cores.`);
  }
  if (webCodecsVideoEncoder && webCodecsVideoFrame) {
    notes.push("WebCodecs is available for native/hardware-accelerated encodes.");
  }
  if (!offscreenCanvas) {
    notes.push("OffscreenCanvas is missing; watermarks render on the main thread.");
  }

  return {
    crossOriginIsolated: isolated,
    sharedArrayBuffer,
    threads,
    deviceMemoryGb,
    offscreenCanvas,
    createImageBitmap,
    webCodecsVideoEncoder,
    webCodecsVideoFrame,
    mediaRecorder,
    multithreaded,
    preferredCore: multithreaded ? "mt" : "st",
    recommendedPreset: recommendPreset(threads, deviceMemoryGb, multithreaded),
    notes,
  };
}

/** Compact one-line summary suitable for a UI hint or telemetry field. */
export function capabilitySummary(caps: EncoderCapabilities): string {
  const parts = [
    `${caps.threads} threads`,
    caps.multithreaded ? "threaded wasm" : "single-thread wasm",
    caps.webCodecsVideoEncoder ? "WebCodecs" : "no WebCodecs",
    `preset ${caps.recommendedPreset}`,
  ];
  if (caps.deviceMemoryGb !== null) parts.push(`${caps.deviceMemoryGb} GiB`);
  return parts.join(" · ");
}
