import { describe, expect, it } from "vitest";
import { watchLink, embedLink, startSeconds, safeExternalUrl } from "@/lib/watch-tools";

describe("Timestamp sharing", () => {
  it("opens the shared video at the selected second", () => {
    expect(watchLink("https://arin-x.lovable.app", "video-1", 65.8)).toBe(
      "https://arin-x.lovable.app/watch/video-1?t=65",
    );
  });
  it("embeds the selected video at the selected second", () => {
    expect(embedLink("https://arin-x.lovable.app", "video-1", 90)).toBe(
      "https://arin-x.lovable.app/embed/video-1?t=90",
    );
  });
  it("rejects invalid or negative playback positions", () => {
    expect(startSeconds("nope")).toBe(0);
    expect(startSeconds(-9)).toBe(0);
    expect(startSeconds(Infinity)).toBe(0);
  });
});

describe("Channel external links", () => {
  it("allows web links but not executable links", () => {
    expect(safeExternalUrl("https://example.com/channel")).toBe("https://example.com/channel");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,test")).toBeNull();
  });
});
