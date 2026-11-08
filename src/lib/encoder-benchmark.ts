/**
 * Pure measurement helpers for the browser encoder.
 *
 * The real measurement (`benchmarkEncoder()` in `src/lib/compress.ts`) loads
 * the SHA-256-verified ffmpeg core and encodes a synthetic clip. Keeping the
 * arithmetic here makes the reported numbers reproducible and unit-testable.
 */
import type { CompressPreset } from "@/lib/media-plan";

export interface EncoderBenchmark {
  /** Wall time to obtain a ready encoder, including verification and WASM load. */
  coreLoadMs: number;
  /** Wall time spent inside `ffmpeg.exec` only. */
  encodeMs: number;
  frames: number;
  sourceFps: number;
  /** Encoded frames per wall-clock second (not playback fps). */
  framesPerSecond: number;
  /** >1 means faster than real time; <1 means slower. */
  realtimeFactor: number;
  msPerFrame: number;
  outputBytes: number;
  outputBytesPerSecond: number;
  multithreaded: boolean;
  coreIntegrityVerified: boolean;
  preset: CompressPreset;
}

export interface RawBenchmarkSample {
  coreLoadMs: number;
  encodeMs: number;
  frames: number;
  sourceFps?: number;
  outputBytes: number;
  multithreaded: boolean;
  preset?: CompressPreset;
}

export function computeBenchmark(sample: RawBenchmarkSample): EncoderBenchmark {
  const sourceFps = Math.max(1, sample.sourceFps ?? 24);
  const frames = Math.max(1, Math.round(sample.frames));
  const encodeMs = Math.max(0, sample.encodeMs);
  const wallSeconds = Math.max(encodeMs / 1000, 1e-6);
  const fps = frames / wallSeconds;
  const videoSeconds = frames / sourceFps;
  return {
    coreLoadMs: Math.max(0, Math.round(sample.coreLoadMs)),
    encodeMs: Math.round(encodeMs),
    frames,
    sourceFps,
    framesPerSecond: Math.round(fps * 100) / 100,
    realtimeFactor: Math.round((videoSeconds / wallSeconds) * 1000) / 1000,
    msPerFrame: Math.round((encodeMs / frames) * 100) / 100,
    outputBytes: sample.outputBytes,
    outputBytesPerSecond: Math.round(sample.outputBytes / wallSeconds),
    multithreaded: sample.multithreaded,
    coreIntegrityVerified: true,
    preset: sample.preset ?? "balanced",
  };
}

/** Pick the fastest preset that still meets a quality floor. */
export function rankPresets(
  results: ReadonlyArray<{ preset: CompressPreset; benchmark: EncoderBenchmark }>,
): CompressPreset[] {
  return [...results]
    .sort((a, b) => b.benchmark.realtimeFactor - a.benchmark.realtimeFactor)
    .map((entry) => entry.preset);
}

export function formatBenchmark(result: EncoderBenchmark): string {
  return (
    `${result.preset} · ${result.multithreaded ? "threaded" : "single-thread"} · ` +
    `${result.realtimeFactor.toFixed(2)}x realtime · ${result.framesPerSecond} fps · ` +
    `${result.msPerFrame} ms/frame · core load ${result.coreLoadMs} ms · ` +
    `${(result.outputBytes / 1024).toFixed(1)} KiB output`
  );
}
