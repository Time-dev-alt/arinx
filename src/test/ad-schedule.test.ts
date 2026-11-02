import { describe, expect, it } from "vitest";
import { guaranteedSeconds, midrollTimes, totalAds } from "@/lib/ad-schedule";

describe("ad schedule", () => {
  it("shows 2 ads (pre + mid) for videos under 3 minutes", () => {
    expect(totalAds(179)).toBe(2);
    expect(midrollTimes(120)).toEqual([60]);
  });
  it("shows 3 ads for videos under 5 minutes", () => {
    expect(totalAds(240)).toBe(3);
    expect(midrollTimes(240)).toHaveLength(2);
  });
  it("shows 5 ads for videos under 15 minutes", () => {
    expect(totalAds(600)).toBe(5);
    expect(midrollTimes(600)).toEqual([120, 240, 360, 480]);
  });
  it("guarantees longer ad time for longer videos", () => {
    expect(guaranteedSeconds(100)).toBe(5);
    expect(guaranteedSeconds(800)).toBe(8);
  });
});
