import { describe, expect, it } from "vitest";
import { validateSiteSettings, type EditableSettings } from "@/lib/settings-validation";

const valid = (): EditableSettings => ({
  ads_enabled: true,
  adsterra_feed: '<script src="https://cdn.example.com/invoke.js"></script>',
  adsterra_native: "",
  adsterra_sidebar: "",
  cf_customer_code: "abc123",
  cf_signed_urls: false,
  compression_enabled: true,
  compression_preset: "balanced",
  preroll_click_url: "https://sponsor.example/landing",
  preroll_enabled: false,
  preroll_skip_seconds: 5,
  preroll_vast_url: "https://ads.example/vast.xml",
  preroll_video_url: "https://cdn.example/ad.mp4",
  protect_player: true,
  watermark_enabled: true,
  watermark_position: "bottom-right",
  watermark_text: "ArinX",
});

describe("owner settings write-time validation", () => {
  it("leaves already-safe settings untouched", () => {
    const result = validateSiteSettings(valid());
    expect(result.errors).toEqual([]);
    expect(result.cleaned).toBe(false);
    expect(result.value.preroll_vast_url).toBe("https://ads.example/vast.xml");
  });

  it("rejects non-HTTPS and control-character URLs before they are stored", () => {
    const a = validateSiteSettings({ ...valid(), preroll_vast_url: "http://ads.example/v.xml" });
    expect(a.errors.some((e) => e.includes("HTTPS"))).toBe(true);
    expect(a.value.preroll_vast_url).toBe("");

    const b = validateSiteSettings({
      ...valid(),
      preroll_click_url: "javascript:alert(1)",
    });
    expect(b.errors.some((e) => e.includes("HTTPS"))).toBe(true);

    const c = validateSiteSettings({
      ...valid(),
      preroll_video_url: "https://cdn.example/a.mp4\nSet-Cookie: x=1",
    });
    expect(c.errors.some((e) => e.includes("invalid characters"))).toBe(true);
  });

  it("strips executable ad markup at write time", () => {
    const result = validateSiteSettings({
      ...valid(),
      adsterra_feed: '<img src="x" onerror="alert(1)"><iframe src="https://evil.example"></iframe>',
    });
    expect(result.value.adsterra_feed).toBe("");
    expect(result.cleaned).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("allowlists enum-like fields and clamps numeric ranges", () => {
    const invalid = validateSiteSettings({
      ...valid(),
      watermark_position: "999:999",
      compression_preset: "alien",
    });
    expect(invalid.errors).toHaveLength(2);
    expect(invalid.value.watermark_position).toBe("bottom-right");
    expect(invalid.value.compression_preset).toBe("balanced");

    const clamped = validateSiteSettings({ ...valid(), preroll_skip_seconds: 999 });
    expect(clamped.errors).toEqual([]);
    expect(clamped.value.preroll_skip_seconds).toBe(30);
    expect(clamped.cleaned).toBe(true);
  });

  it("bounds free-text fields used in metadata and the encoder", () => {
    const result = validateSiteSettings({
      ...valid(),
      watermark_text: `  ArinX\u0000 ${"x".repeat(300)}  `,
      cf_customer_code: "code\nwith\nnewlines",
    });
    expect(result.value.watermark_text).toHaveLength(120);
    expect(result.value.watermark_text).not.toContain("\u0000");
    expect(result.value.cf_customer_code).not.toContain("\n");
    expect(result.errors).toEqual([]);
  });
});
