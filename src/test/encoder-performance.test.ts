import { describe, expect, it } from "vitest";
import {
  capabilitySummary,
  detectEncoderCapabilities,
  recommendPreset,
} from "@/lib/encoder-capabilities";
import {
  computeBenchmark,
  formatBenchmark,
  rankPresets,
  type EncoderBenchmark,
} from "@/lib/encoder-benchmark";

const weak = (extra: Record<string, unknown> = {}) => ({
  navigator: { hardwareConcurrency: 2, deviceMemory: 2 },
  ...extra,
});

const strong = (extra: Record<string, unknown> = {}) => ({
  crossOriginIsolated: true,
  SharedArrayBuffer: function SAB() {},
  navigator: { hardwareConcurrency: 12, deviceMemory: 16 },
  OffscreenCanvas: function OC() {},
  createImageBitmap: () => Promise.resolve({}),
  VideoEncoder: function VE() {},
  VideoFrame: function VF() {},
  MediaRecorder: function MR() {},
  ...extra,
});

describe("encoder capability detection", () => {
  it("never chooses the threaded core without isolation, SAB and ≥2 cores", () => {
    expect(detectEncoderCapabilities(weak()).preferredCore).toBe("st");
    expect(detectEncoderCapabilities(weak({ crossOriginIsolated: true })).preferredCore).toBe("st");
    expect(
      detectEncoderCapabilities({
        crossOriginIsolated: true,
        SharedArrayBuffer: function SAB() {},
        navigator: { hardwareConcurrency: 1 },
      }).preferredCore,
    ).toBe("st");
    expect(detectEncoderCapabilities(strong()).preferredCore).toBe("mt");
  });

  it("is safe on a scope with no navigator at all", () => {
    const caps = detectEncoderCapabilities({});
    expect(caps.threads).toBe(1);
    expect(caps.deviceMemoryGb).toBeNull();
    expect(caps.multithreaded).toBe(false);
    expect(caps.recommendedPreset).toBe("ultra");
  });

  it("reports WebCodecs, canvas and memory honestly", () => {
    const caps = detectEncoderCapabilities(strong());
    expect(caps.webCodecsVideoEncoder).toBe(true);
    expect(caps.webCodecsVideoFrame).toBe(true);
    expect(caps.offscreenCanvas).toBe(true);
    expect(caps.createImageBitmap).toBe(true);
    expect(caps.mediaRecorder).toBe(true);
    expect(caps.deviceMemoryGb).toBe(16);
    expect(caps.notes.join(" ")).toContain("WebCodecs");
    expect(capabilitySummary(caps)).toContain("12 threads");
  });

  it("recommends a conservative preset for weak devices", () => {
    expect(recommendPreset(2, 2, false)).toBe("ultra");
    expect(recommendPreset(8, null, false)).toBe("balanced");
    expect(recommendPreset(8, 8, true)).toBe("quality");
    expect(recommendPreset(16, 2, true)).toBe("ultra");
  });
});

describe("encoder benchmark arithmetic", () => {
  it("computes realtime factor, fps and per-frame cost from a real sample", () => {
    const result = computeBenchmark({
      coreLoadMs: 812.4,
      encodeMs: 1000,
      frames: 48,
      sourceFps: 24,
      outputBytes: 65_536,
      multithreaded: true,
      preset: "ultra",
    });
    // 48 frames / 1s = 48 fps; 2s of video in 1s = 2x realtime.
    expect(result.framesPerSecond).toBe(48);
    expect(result.realtimeFactor).toBe(2);
    expect(result.msPerFrame).toBeCloseTo(20.83, 1);
    expect(result.coreLoadMs).toBe(812);
    expect(result.outputBytesPerSecond).toBe(65_536);
    expect(result.coreIntegrityVerified).toBe(true);
    expect(result.multithreaded).toBe(true);
  });

  it("clamps degenerate samples instead of producing Infinity or NaN", () => {
    const result = computeBenchmark({
      coreLoadMs: -1,
      encodeMs: 0,
      frames: 0,
      outputBytes: 0,
      multithreaded: false,
    });
    expect(Number.isFinite(result.framesPerSecond)).toBe(true);
    expect(Number.isFinite(result.realtimeFactor)).toBe(true);
    expect(result.frames).toBe(1);
    expect(result.coreLoadMs).toBe(0);
  });

  it("ranks presets by measured speed and formats a readable summary", () => {
    const make = (preset: "ultra" | "balanced" | "quality", factor: number) => ({
      preset,
      benchmark: { realtimeFactor: factor } as EncoderBenchmark,
    });
    expect(rankPresets([make("balanced", 1.1), make("ultra", 3.4), make("quality", 0.6)])).toEqual([
      "ultra",
      "balanced",
      "quality",
    ]);
    const formatted = formatBenchmark(
      computeBenchmark({
        coreLoadMs: 100,
        encodeMs: 500,
        frames: 24,
        outputBytes: 32_768,
        multithreaded: false,
        preset: "balanced",
      }),
    );
    expect(formatted).toContain("2.00x realtime");
    expect(formatted).toContain("48 fps");
    expect(formatted).toContain("single-thread");
  });
});
