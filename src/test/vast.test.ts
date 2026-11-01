import { describe, expect, it } from "vitest";
import { parseSkipOffset } from "@/components/PrerollAd";

describe("parseSkipOffset", () => {
  it("parses HH:MM:SS offsets", () => {
    expect(parseSkipOffset("00:00:05", 30)).toBe(5);
    expect(parseSkipOffset("00:01:30", 120)).toBe(90);
  });
  it("parses plain seconds", () => {
    expect(parseSkipOffset("7", 30)).toBe(7);
  });
  it("parses percentage offsets against the creative duration", () => {
    expect(parseSkipOffset("50%", 20)).toBe(10);
  });
  it("falls back to 5 seconds for missing or invalid offsets", () => {
    expect(parseSkipOffset(null, 30)).toBe(5);
    expect(parseSkipOffset("abc", 30)).toBe(5);
    expect(parseSkipOffset("50%", 0)).toBe(5);
  });
});
